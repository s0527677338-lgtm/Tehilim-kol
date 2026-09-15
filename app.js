const GEMATRIA = {
  א: 1,
  ב: 2,
  ג: 3,
  ד: 4,
  ה: 5,
  ו: 6,
  ז: 7,
  ח: 8,
  ט: 9,
  י: 10,
  כ: 20,
  ך: 20,
  ל: 30,
  מ: 40,
  ם: 40,
  נ: 50,
  ן: 50,
  ס: 60,
  ע: 70,
  פ: 80,
  ף: 80,
  צ: 90,
  ץ: 90,
  ק: 100,
  ר: 200,
  ש: 300,
  ת: 400,
};

const ONES = ["", "א", "ב", "ג", "ד", "ה", "ו", "ז", "ח", "ט"];
const TENS = ["", "י", "כ", "ל", "מ", "נ", "ס", "ע", "פ", "צ"];
const HUNDREDS = ["", "ק", "ר", "ש", "ת"];
const LATIN = /[A-Za-z]/;
const STRIP = /[\s'"׳״־–-]/g;

const els = {
  input: document.getElementById("chapter-input"),
  error: document.getElementById("error"),
  start: document.getElementById("start-btn"),
  stop: document.getElementById("stop-btn"),
  display: document.getElementById("chapter-display"),
  title: document.getElementById("chapter-title"),
  verses: document.getElementById("verses"),
  status: document.getElementById("status"),
  voiceNote: document.getElementById("voice-note"),
  floatingStop: document.getElementById("floating-stop-btn"),
};

const synth = window.speechSynthesis || null;

const AUDIO_CACHE_LIMIT = 120;
const SPEECH_CHUNK_WORDS = 4;
const CANTILLATION = /[\u0591-\u05AF\u05BD\u05BF\u05C0\u05C3-\u05C7]/g;
const DIVINE_NAME = /י[\u0591-\u05C7]*ה[\u0591-\u05C7]*ו[\u0591-\u05C7]*ה/g;
const DIVINE_NAME_READING = "אדוני";
const audioCache = new Map();

let tehilim = null;
let selectedVoice = null;
let voicesPromise = null;
let currentUtterance = null;
let currentAudio = null;
// null = not probed yet, true = gTTS server reachable, false = fall back to the browser.
let serverSpeech = null;
let playing = false;
let cancelled = false;
let waitTimer = null;
let waitResolve = null;
let currentChapter = null;

function hebrewLetters(n) {
  if (n === 15) return "טו";
  if (n === 16) return "טז";
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  let letters = HUNDREDS[hundreds] || "";
  if (rest === 15) return letters + "טו";
  if (rest === 16) return letters + "טז";
  letters += (TENS[Math.floor(rest / 10)] || "") + (ONES[rest % 10] || "");
  return letters;
}

function withGeresh(letters) {
  if (letters.length === 1) return `${letters}'`;
  return `${letters.slice(0, -1)}"${letters.slice(-1)}`;
}

function chapterLabel(n) {
  return withGeresh(hebrewLetters(n));
}

function parseChapter(raw) {
  const value = (raw || "").trim();
  if (!value) {
    return { error: "יש להזין מספר פרק" };
  }
  if (LATIN.test(value)) {
    return { error: "נא להזין אותיות עבריות בלבד" };
  }
  const letters = value.replace(STRIP, "");
  if (!letters) {
    return { error: "יש להזין מספר פרק" };
  }
  let total = 0;
  for (const ch of letters) {
    if (!(ch in GEMATRIA)) {
      return { error: "נא להזין אותיות עבריות בלבד" };
    }
    total += GEMATRIA[ch];
  }
  if (total < 1 || total > 150) {
    return { error: "הכנס מספר תהילים מתאים" };
  }
  return { chapter: total };
}

function setError(message) {
  els.error.textContent = message || "";
}

function setVoiceNote(message) {
  if (els.voiceNote) els.voiceNote.textContent = message || "";
}

function showFloatingStop(visible) {
  if (els.floatingStop) els.floatingStop.classList.toggle("hidden", !visible);
}

// Chrome/Edge populate the voice list asynchronously and do not always fire
// voiceschanged, so poll until it fills or we give up.
function loadVoices() {
  if (voicesPromise) return voicesPromise;
  voicesPromise = new Promise((resolve) => {
    if (!synth) {
      resolve([]);
      return;
    }
    if (synth.getVoices().length) {
      resolve(synth.getVoices());
      return;
    }
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearInterval(poll);
      clearTimeout(timeout);
      synth.removeEventListener("voiceschanged", finish);
      resolve(synth.getVoices());
    };
    const poll = setInterval(() => {
      if (synth.getVoices().length) finish();
    }, 100);
    const timeout = setTimeout(finish, 3000);
    synth.addEventListener("voiceschanged", finish);
  });
  return voicesPromise;
}

function pickHebrewVoice(voices) {
  return (
    voices.find((voice) => /asaf/i.test(voice.name)) ||
    voices.find((voice) => /^he(-|_|$)/i.test(voice.lang) && /male|avri|david|moshe/i.test(voice.name)) ||
    voices.find((voice) => /^he(-|_|$)/i.test(voice.lang)) ||
    voices.find((voice) => /hebrew|ivrit|עבר/i.test(`${voice.name} ${voice.lang}`)) ||
    null
  );
}

async function refreshVoice() {
  if (!synth) {
    selectedVoice = null;
    return;
  }

  const voices = await loadVoices();
  if (!voices.length) {
    selectedVoice = null;
    return;
  }

  // Without a Hebrew voice, forcing lang="he-IL" makes the browser stay silent,
  // so fall back to whatever voice the system does have.
  selectedVoice = pickHebrewVoice(voices) || voices.find((voice) => voice.default) || voices[0];
}

function refreshVoiceLater() {
  voicesPromise = null;
  refreshVoice();
}

function reportBrowserFallback() {
  if (!synth || !selectedVoice) {
    setVoiceNote(
      "אין קול הקראה זמין. הפעל את השרת המקומי (python server.py) כדי לקבל הקראה בעברית."
    );
    return;
  }
  if (/^he(-|_|$)/i.test(selectedVoice.lang)) {
    setVoiceNote("");
    return;
  }
  setVoiceNote(
    "השרת המקומי אינו זמין ואין קול עברי מותקן, ולכן ההקראה נשמעת בקול לא-עברי. להקראה בעברית: הפעל python server.py ופתח את http://localhost:8080"
  );
}

function wait(ms) {
  return new Promise((resolve) => {
    waitResolve = resolve;
    waitTimer = setTimeout(() => {
      waitTimer = null;
      waitResolve = null;
      resolve();
    }, ms);
  });
}

function clearWait() {
  if (waitTimer) {
    clearTimeout(waitTimer);
    waitTimer = null;
  }
  if (waitResolve) {
    const resolve = waitResolve;
    waitResolve = null;
    resolve();
  }
}

function prepareForSpeech(text) {
  return text
    // "*כתיב **קרי" - only the qere is read aloud, so drop the ketiv word
    // together with its markers instead of announcing "כוכבית".
    .replace(/\*[^\s*]+\s+\*\*/g, "")
    .replaceAll("*", "")
    .replace(CANTILLATION, "")
    .replace(DIVINE_NAME, DIVINE_NAME_READING)
    .replace(/[־–]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Read at most a few words at a time so the listener can follow along.
function splitForSpeech(text) {
  const words = prepareForSpeech(text || "")
    .split(" ")
    .filter(Boolean);
  if (!words.length) return [];

  const chunks = [];
  for (let i = 0; i < words.length; i += SPEECH_CHUNK_WORDS) {
    chunks.push(words.slice(i, i + SPEECH_CHUNK_WORDS).join(" "));
  }
  return chunks;
}

function buildChapterSegments(verses) {
  const segments = [];
  verses.forEach((verse, verseIndex) => {
    splitForSpeech(verse).forEach((text) => segments.push({ verseIndex, text }));
  });
  return segments;
}

function trimAudioCache() {
  while (audioCache.size > AUDIO_CACHE_LIMIT) {
    const oldest = audioCache.keys().next().value;
    const entry = audioCache.get(oldest);
    audioCache.delete(oldest);
    Promise.resolve(entry)
      .then((url) => URL.revokeObjectURL(url))
      .catch(() => {});
  }
}

// Ask the local gTTS server for real Hebrew audio. This is what makes the app
// work on machines with no Hebrew voice installed.
function requestAudio(content) {
  const cached = audioCache.get(content);
  if (cached) return cached;

  const pending = fetch("/api/speech", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: content }),
  })
    .then((response) => {
      if (!response.ok) throw new Error("server speech failed");
      return response.blob();
    })
    .then((blob) => URL.createObjectURL(blob));

  pending.catch(() => audioCache.delete(content));
  audioCache.set(content, pending);
  trimAudioCache();
  return pending;
}

function prefetchAudio(text) {
  if (serverSpeech === false) return;
  const content = prepareForSpeech(text || "");
  if (content) requestAudio(content).catch(() => {});
}

function playAudio(url) {
  return new Promise((resolve, reject) => {
    const audio = new Audio(url);
    currentAudio = audio;
    audio.onended = () => {
      currentAudio = null;
      resolve();
    };
    audio.onerror = () => {
      currentAudio = null;
      reject(new Error("audio playback failed"));
    };
    audio.play().catch(reject);
  });
}

async function speakWithServer(content) {
  await playAudio(await requestAudio(content));
}

function speakWithBrowser(content) {
  return new Promise((resolve) => {
    if (!synth) {
      resolve();
      return;
    }

    const utterance = new SpeechSynthesisUtterance(content);
    utterance.rate = 0.92;
    utterance.pitch = 0.95;
    if (selectedVoice) {
      utterance.voice = selectedVoice;
      utterance.lang = selectedVoice.lang;
    } else {
      utterance.lang = "he-IL";
    }

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(watchdog);
      currentUtterance = null;
      resolve();
    };

    utterance.onend = finish;
    utterance.onerror = (event) => {
      const reason = event.error || "unknown";
      if (reason !== "interrupted" && reason !== "canceled") {
        setError(`שגיאת הקראה: ${reason}`);
      }
      finish();
    };

    // Keeping a reference prevents the utterance being garbage collected
    // mid-playback, a long-standing Chrome bug that causes silent drops.
    currentUtterance = utterance;
    if (synth.paused) synth.resume();
    synth.speak(utterance);

    // If the queue was left in a broken state by a previous cancel, speak()
    // does nothing at all. Retry once before giving up.
    const watchdog = setTimeout(() => {
      if (done || cancelled || synth.speaking || synth.pending) return;
      synth.cancel();
      synth.speak(utterance);
    }, 400);
  });
}

async function speak(text) {
  const content = prepareForSpeech(text);
  const started = performance.now();
  if (!content) return 0;

  if (serverSpeech !== false) {
    try {
      await speakWithServer(content);
      if (serverSpeech === null) {
        serverSpeech = true;
        setVoiceNote("");
      }
      return performance.now() - started;
    } catch (error) {
      // The server is optional: on any failure we degrade to browser speech
      // rather than interrupting the reading.
      if (serverSpeech === null) {
        serverSpeech = false;
        reportBrowserFallback();
      }
    }
  }

  if (cancelled) return performance.now() - started;
  await speakWithBrowser(content);
  return performance.now() - started;
}

function renderChapter(n) {
  currentChapter = n;
  const verses = tehilim[String(n)] || [];
  els.title.textContent = `תהילים פרק ${chapterLabel(n)}`;
  els.verses.innerHTML = verses
    .map(
      (verse, index) =>
        `<p class="verse" data-index="${index}"><span class="verse-num">${index + 1}</span>${verse}</p>`
    )
    .join("");
  els.display.classList.remove("hidden");
  els.start.disabled = false;
}

function highlightVerse(index) {
  els.verses.querySelectorAll(".verse").forEach((node, i) => {
    node.classList.toggle("active", i === index);
    if (i === index) node.scrollIntoView({ block: "center", behavior: "smooth" });
  });
}

function showChapterFromInput() {
  if (playing) return;
  const result = parseChapter(els.input.value);
  if (result.error) {
    setError(result.error);
    els.display.classList.add("hidden");
    els.start.disabled = true;
    currentChapter = null;
    return;
  }
  setError("");
  renderChapter(result.chapter);
}

async function readSegments(segments) {
  let shownVerse = -1;
  for (let i = 0; i < segments.length; i += 1) {
    if (cancelled) return;
    const segment = segments[i];
    if (segment.verseIndex !== shownVerse) {
      shownVerse = segment.verseIndex;
      highlightVerse(shownVerse);
    }
    if (segments[i + 1]) prefetchAudio(segments[i + 1].text);
    const duration = await speak(segment.text);
    if (cancelled) return;
    await wait(duration);
  }
}

async function readLoop(startChapter) {
  playing = true;
  cancelled = false;
  els.start.disabled = true;
  els.stop.disabled = false;
  els.input.disabled = true;
  showFloatingStop(true);
  setError("");
  if (synth) synth.cancel();
  await refreshVoice();

  let chapter = startChapter;
  while (!cancelled) {
    renderChapter(chapter);
    els.status.textContent = `מקריא פרק ${chapterLabel(chapter)}`;
    const verses = tehilim[String(chapter)] || [];
    const segments = buildChapterSegments(verses);
    if (segments.length) prefetchAudio(segments[0].text);
    await speak(`פרק ${hebrewLetters(chapter)}`);
    if (cancelled) break;

    await readSegments(segments);

    if (cancelled) break;
    els.status.textContent = "מעבר לפרק הבא...";
    highlightVerse(-1);
    await wait(4000);
    if (cancelled) break;
    chapter = chapter === 150 ? 1 : chapter + 1;
  }

  playing = false;
  els.input.disabled = false;
  els.stop.disabled = true;
  showFloatingStop(false);
  els.start.disabled = !currentChapter;
  els.status.textContent = cancelled ? "ההקראה נעצרה" : "";
}

function stopReading() {
  cancelled = true;
  clearWait();
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
  if (synth) synth.cancel();
}

async function loadTehilim() {
  const embedded = document.getElementById("tehilim-data");
  if (embedded && embedded.textContent.trim()) {
    return JSON.parse(embedded.textContent);
  }
  const response = await fetch("tehilim.json");
  if (!response.ok) {
    throw new Error("missing tehilim.json");
  }
  return response.json();
}

els.input.addEventListener("input", showChapterFromInput);
els.start.addEventListener("click", () => {
  if (!currentChapter || playing) return;
  readLoop(currentChapter);
});
els.stop.addEventListener("click", stopReading);
if (els.floatingStop) els.floatingStop.addEventListener("click", stopReading);

if (synth) {
  synth.addEventListener("voiceschanged", refreshVoiceLater);
}
refreshVoice();

loadTehilim()
  .then((data) => {
    tehilim = data;
    showChapterFromInput();
  })
  .catch(() => {
    setError("לא ניתן לטעון את ספר תהילים");
  });
