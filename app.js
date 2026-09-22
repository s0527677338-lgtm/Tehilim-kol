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
  language: document.getElementById("language-select"),
  languageLabel: document.getElementById("language-label"),
  appTitle: document.getElementById("app-title"),
  subtitle: document.getElementById("subtitle"),
  chapterLabel: document.getElementById("chapter-label"),
  credit: document.getElementById("creator-credit"),
  input: document.getElementById("chapter-input"),
  error: document.getElementById("error"),
  start: document.getElementById("start-btn"),
  stop: document.getElementById("stop-btn"),
  change: document.getElementById("change-btn"),
  display: document.getElementById("chapter-display"),
  title: document.getElementById("chapter-title"),
  verses: document.getElementById("verses"),
  status: document.getElementById("status"),
  voiceNote: document.getElementById("voice-note"),
  installNote: document.getElementById("install-note"),
  installBtn: document.getElementById("install-btn"),
  speed: document.getElementById("speed-btn"),
  floatingControls: document.getElementById("floating-controls"),
  floatingStop: document.getElementById("floating-stop-btn"),
  floatingChange: document.getElementById("floating-change-btn"),
  floatingBack: document.getElementById("floating-back-btn"),
  floatingSpeed: document.getElementById("floating-speed-btn"),
};

const synth = window.speechSynthesis || null;

const AUDIO_CACHE_LIMIT = 120;

// How many words are spoken at a time.
//
// Current setting: 1 word per piece, so every word is read on its own.
//
// Previous setting, kept here for reference: SPEECH_CHUNK_WORDS = 3 with
// LAST_CHUNK_IF_ONE_LEFT = 4. Verses were cut every 3 words, and when the last
// cut would leave a single word alone, that word joined the previous piece so
// the final piece held 4 words instead of 3 + 1:
//    4 words  -> 4
//    5 words  -> 3 + 2
//    6 words  -> 3 + 3
//    7 words  -> 3 + 4        (instead of 3 + 3 + 1)
//    8 words  -> 3 + 3 + 2
//   10 words  -> 3 + 3 + 4    (instead of 3 + 3 + 3 + 1)
const SPEECH_CHUNK_WORDS = 1;
// Merging a leftover word only makes sense when a piece holds several words,
// so this rule is disabled while reading one word at a time.
const LAST_CHUNK_IF_ONE_LEFT = SPEECH_CHUNK_WORDS > 1 ? SPEECH_CHUNK_WORDS + 1 : 0;
// After each spoken piece we wait a fraction of its duration.
// Regular: one fifth less than the spoken length (80%).
// Fast: half the regular wait (40%).
// Fastest: half the fast wait (20%).
const WAIT_AFTER_SPEECH = [0.8, 0.4, 0.2];
// Shortening the wait alone barely helps at the fastest grade, because most of
// the time is the audio itself, so that grade also plays the voice quicker.
const PLAYBACK_RATE = [1, 1, 1.35];
const NIKUD = /[\u05B0-\u05BC\u05C1\u05C2\u05C7]/;
// Maqaf and dashes join two words, so they become a space rather than vanish.
const WORD_JOINERS = /[\u05BE\u2013-]/g;
// Anything that is not a Hebrew letter, a nikud mark or a space is dropped:
// cantillation marks, meteg, paseq, sof pasuq, brackets, digits, Latin letters
// and invisible bidi controls.
const NOT_LETTER_OR_NIKUD = /[^\u05D0-\u05EA\u05B0-\u05BC\u05C1\u05C2\u05C7 ]/g;
// The displayed verses additionally keep the sof pasuq (׃), which marks where a
// verse ends. It is only a visual cue, so the spoken text drops it.
const NOT_LETTER_NIKUD_OR_SOF_PASUQ = /[^\u05D0-\u05EA\u05B0-\u05BC\u05C1\u05C2\u05C7\u05C3 ]/g;
const DIVINE_NAME = /י[\u0591-\u05C7]*ה[\u0591-\u05C7]*ו[\u0591-\u05C7]*ה/g;
// Spelled with nikud so the voice says "adonai" when the four-letter name
// (yud-heh-vav-heh) appears in the verse.
const DIVINE_NAME_READING = "אֲדֹנָי";
// When the Name is pointed with a hireq (יהוִה), it stands next to אֲדֹנָי
// and is traditionally read "elohim" rather than "adonai" a second time.
const ELOHIM_READING = "אֱלֹהִים";
// The dagesh - the dot inside a letter - only changes the sound in ב, כ and פ.
// Anywhere else the voices stumble on it, so it is dropped before speaking.
// The dot in ו is kept because there it is a shuruk vowel ("u"), not a dagesh,
// and removing it would turn a word such as וּבְדֶרֶךְ into "vevderech".
const DAGESH_KEEPERS = /[בכךפףו]/;
// The qamats in כָּל is a qamats qatan, so the word is read "kol", but the
// voices read that spelling as "kal". Respelling it with a vav is read
// correctly. A maqaf has already become a space by then, so the forms written
// כָּל־ are covered as well, and כֹּל is included since it is read the same.
const STANDALONE_KOL = /(^|\s)כ[\u05B0-\u05BC\u05C1\u05C2\u05C7]*ל(?=$|\s)/g;
const KOL_READING = "כּוֹל";
// Other marks (a shin dot, or a vowel when the text is in canonical order) can
// sit between the letter and its dagesh, so they are matched and kept as-is.
const LETTER_WITH_DAGESH = /([\u05D0-\u05EA])([\u0591-\u05BB\u05BD-\u05C7]*)\u05BC/g;
const audioCache = new Map();

const I18N = {
  he: {
    language: "שפה",
    title: "תהילים",
    subtitle: "הקראת תהילים בעברית — אפשר להתקין למסך הבית בטלפון",
    chapterPrompt: "מאיזה תהילים להתחיל?",
    chapterPlaceholder: "לדוגמה: יח או 18",
    start: "התחל להקריא",
    stop: "עצור",
    resume: "המשך",
    change: "החלף פרק",
    back: "◀ חזור פסוק אחורה",
    install: "הוסף למסך הבית",
    credit: "הוכן ע\"י שרה גבאי 0527677338",
    speedActions: ["החלף למהיר יותר", "החלף לעוד יותר מהר", "החלף לאיטי יותר"],
    speedNames: ["רגילה", "מהירה", "מהירה מאוד"],
    missingChapter: "יש להזין מספר פרק",
    invalidChapter: "נא להזין מספר בין 1 ל-150 או אותיות עבריות",
    chapterRange: "הכנס מספר תהילים מתאים בין 1 ל-150",
    chapterTitle: (label) => `תהילים פרק ${label}`,
    reading: (label, speed) => `מקריא פרק ${label}${speed ? " — מהירות " + speed : ""}`,
    nextChapter: "מעבר לפרק הבא...",
    chooseChapter: "בחרו פרק ולחצו התחל להקריא",
    paused: "ההקראה נעצרה — לחצו המשך",
    changeHelp: "הקלידו פרק חדש ולחצו התחל להקריא",
    loadError: "לא ניתן לטעון את ספר תהילים",
    speechError: (reason) => `שגיאת הקראה: ${reason}`,
    noVoice: "אין קול הקראה זמין. הפעילו את השרת המקומי (python server.py) כדי לקבל הקראה בעברית.",
    fallbackVoice: "השרת המקומי אינו זמין ואין קול עברי מותקן. הפעילו python server.py ופתחו את http://localhost:8080",
    iosInstall: "באייפון: לחצו על שיתוף (הריבוע עם החץ) ואז \"הוסף למסך הבית\".",
    installAvailable: "אפשר להתקין את תהילים כאייקון במסך הבית.",
  },
  en: {
    language: "Language",
    title: "Psalms",
    subtitle: "Hebrew Psalms reader — can be installed on your phone",
    chapterPrompt: "Which Psalm should reading begin from?",
    chapterPlaceholder: "For example: 18 or יח",
    start: "Start reading",
    stop: "Pause",
    resume: "Continue",
    change: "Change Psalm",
    back: "◀ Previous verse",
    install: "Add to Home Screen",
    credit: "Created by Sara Gabay 0527677338",
    speedActions: ["Switch to faster", "Switch to even faster", "Switch to slower"],
    speedNames: ["normal", "fast", "very fast"],
    missingChapter: "Enter a Psalm number",
    invalidChapter: "Enter a number from 1 to 150 or Hebrew letters",
    chapterRange: "Enter a Psalm number from 1 to 150",
    chapterTitle: (label) => `Psalm ${label}`,
    reading: (label, speed) => `Reading Psalm ${label}${speed ? " — " + speed + " speed" : ""}`,
    nextChapter: "Moving to the next Psalm...",
    chooseChapter: "Choose a Psalm and press Start reading",
    paused: "Reading paused — press Continue",
    changeHelp: "Enter a new Psalm and press Start reading",
    loadError: "The Book of Psalms could not be loaded",
    speechError: (reason) => `Reading error: ${reason}`,
    noVoice: "No reading voice is available. Run python server.py for Hebrew reading.",
    fallbackVoice: "The local server and a Hebrew system voice are unavailable. Run python server.py and open http://localhost:8080",
    iosInstall: "On iPhone: tap Share, then “Add to Home Screen”.",
    installAvailable: "You can install Psalms as a Home Screen app.",
  },
  fr: {
    language: "Langue",
    title: "Psaumes",
    subtitle: "Lecture des Psaumes en hébreu — installable sur votre téléphone",
    chapterPrompt: "À partir de quel Psaume commencer ?",
    chapterPlaceholder: "Par exemple : 18 ou יח",
    start: "Commencer la lecture",
    stop: "Pause",
    resume: "Continuer",
    change: "Changer de Psaume",
    back: "◀ Verset précédent",
    install: "Ajouter à l’écran d’accueil",
    credit: "Créé par Sara Gabay 0527677338",
    speedActions: ["Passer en vitesse rapide", "Passer encore plus vite", "Passer plus lentement"],
    speedNames: ["normale", "rapide", "très rapide"],
    missingChapter: "Saisissez un numéro de Psaume",
    invalidChapter: "Saisissez un nombre de 1 à 150 ou des lettres hébraïques",
    chapterRange: "Saisissez un numéro de Psaume de 1 à 150",
    chapterTitle: (label) => `Psaume ${label}`,
    reading: (label, speed) => `Lecture du Psaume ${label}${speed ? " — vitesse " + speed : ""}`,
    nextChapter: "Passage au Psaume suivant...",
    chooseChapter: "Choisissez un Psaume et appuyez sur Commencer",
    paused: "Lecture en pause — appuyez sur Continuer",
    changeHelp: "Saisissez un nouveau Psaume et appuyez sur Commencer",
    loadError: "Impossible de charger le Livre des Psaumes",
    speechError: (reason) => `Erreur de lecture : ${reason}`,
    noVoice: "Aucune voix disponible. Lancez python server.py pour la lecture en hébreu.",
    fallbackVoice: "Le serveur local et la voix hébraïque ne sont pas disponibles. Lancez python server.py et ouvrez http://localhost:8080",
    iosInstall: "Sur iPhone : touchez Partager, puis « Sur l’écran d’accueil ».",
    installAvailable: "Vous pouvez installer Psaumes sur l’écran d’accueil.",
  },
};

let tehilim = null;
let selectedVoice = null;
let voicesPromise = null;
let currentUtterance = null;
let currentAudio = null;
// null = not probed yet, true = gTTS server reachable, false = fall back to the browser.
let serverSpeech = null;
let playing = false;
let cancelled = false;
let paused = false;
let speedLevel = 0;
let currentLanguage = localStorage.getItem("tehilim-language") || "he";
let waitTimer = null;
let waitResolve = null;
let resumeResolve = null;
let speechDone = null;
let currentChapter = null;
let pendingRestart = false;
let currentSegments = [];
let segmentIndex = 0;
let jumpRequested = false;

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

function tr(key, ...args) {
  const value = (I18N[currentLanguage] || I18N.he)[key];
  return typeof value === "function" ? value(...args) : value;
}

function parseChapter(raw) {
  const value = (raw || "").trim();
  if (!value) {
    return { error: tr("missingChapter") };
  }

  if (/^\d+$/.test(value)) {
    const chapter = Number(value);
    return chapter >= 1 && chapter <= 150
      ? { chapter }
      : { error: tr("chapterRange") };
  }

  if (LATIN.test(value)) {
    return { error: tr("invalidChapter") };
  }
  const letters = value.replace(STRIP, "");
  if (!letters) {
    return { error: tr("missingChapter") };
  }
  let total = 0;
  for (const ch of letters) {
    if (!(ch in GEMATRIA)) {
      return { error: tr("invalidChapter") };
    }
    total += GEMATRIA[ch];
  }
  if (total < 1 || total > 150) {
    return { error: tr("chapterRange") };
  }
  return { chapter: total };
}

function setError(message) {
  els.error.textContent = message || "";
}

function setVoiceNote(message) {
  if (els.voiceNote) els.voiceNote.textContent = message || "";
}

function showFloatingControls(visible) {
  if (els.floatingControls) els.floatingControls.classList.toggle("hidden", !visible);
}

function setPauseResumeLabel(isPaused) {
  const label = isPaused ? tr("resume") : tr("stop");
  const floating = isPaused ? `▶ ${tr("resume")}` : `■ ${tr("stop")}`;
  if (els.stop) els.stop.textContent = label;
  if (els.floatingStop) els.floatingStop.textContent = floating;
}

function applyLanguage() {
  if (!I18N[currentLanguage]) currentLanguage = "he";
  document.documentElement.lang = currentLanguage;
  document.documentElement.dir = currentLanguage === "he" ? "rtl" : "ltr";
  document.body.dir = currentLanguage === "he" ? "rtl" : "ltr";
  els.language.value = currentLanguage;
  els.languageLabel.textContent = tr("language");
  els.appTitle.textContent = tr("title");
  els.subtitle.textContent = tr("subtitle");
  els.chapterLabel.textContent = tr("chapterPrompt");
  els.input.placeholder = tr("chapterPlaceholder");
  els.start.textContent = tr("start");
  els.change.textContent = tr("change");
  els.floatingChange.textContent = tr("change");
  els.floatingBack.textContent = tr("back");
  els.installBtn.textContent = tr("install");
  // The requested creator signature always remains in its original Hebrew.
  els.credit.textContent = I18N.he.credit;
  setPauseResumeLabel(paused);
  updateSpeedLabels();

  if (currentChapter) renderChapter(currentChapter);
  if (playing) {
    els.status.textContent = paused
      ? tr("paused")
      : tr("reading", chapterLabel(currentChapter), tr("speedNames")[speedLevel]);
  }
}

function finishSpeech() {
  if (!speechDone) return;
  const done = speechDone;
  speechDone = null;
  done();
}

function haltPlayback() {
  if (currentAudio) {
    currentAudio.onended = null;
    currentAudio.onerror = null;
    currentAudio.pause();
    currentAudio = null;
  }
  if (synth) synth.cancel();
  finishSpeech();
}

function waitWhilePaused() {
  if (!paused) return Promise.resolve();
  return new Promise((resolve) => {
    resumeResolve = resolve;
  });
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
    setVoiceNote(tr("noVoice"));
    return;
  }
  if (/^he(-|_|$)/i.test(selectedVoice.lang)) {
    setVoiceNote("");
    return;
  }
  setVoiceNote(tr("fallbackVoice"));
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

function stripMarks(text, unwanted) {
  return (text || "")
    .replace(WORD_JOINERS, " ")
    .replace(unwanted, "")
    .replace(/\s+/g, " ")
    .trim();
}

function dropRedundantDagesh(text) {
  return text.replace(LETTER_WITH_DAGESH, (match, letter, marks) =>
    DAGESH_KEEPERS.test(letter) ? match : letter + marks
  );
}

function replaceElohimPointedName(text) {
  return text.replace(DIVINE_NAME, (match) =>
    match.includes("\u05B4") ? ELOHIM_READING : match
  );
}

function cleanVerseText(text) {
  return dropRedundantDagesh(
    replaceElohimPointedName(stripMarks(text, NOT_LETTER_NIKUD_OR_SOF_PASUQ))
  );
}

function prepareForSpeech(text) {
  const plain = stripMarks(
    // "*כתיב **קרי" - only the qere is read aloud, so drop the ketiv word
    // together with its markers instead of announcing "כוכבית".
    (text || "").replace(/\*[^\s*]+\s+\*\*/g, ""),
    NOT_LETTER_OR_NIKUD
  );
  return dropRedundantDagesh(replaceElohimPointedName(plain))
    .replace(DIVINE_NAME, DIVINE_NAME_READING)
    .replace(STANDALONE_KOL, `$1${KOL_READING}`)
    // A word-final patah under ח is a furtive patah, pronounced "ach" with the
    // vowel before the letter ("ruach"), never "ha". Respelling the ending as
    // אַך is what the voices read correctly: the patah sits on the א and the
    // final kaf carries the same guttural sound as the ח it replaces.
    .replace(/חַ(?=$|\s)/g, "אַך");
}

// Cut the verse into pieces of SPEECH_CHUNK_WORDS words so the listener can
// follow along. See the constants above for the sizing rule.
function splitForSpeech(text) {
  const words = prepareForSpeech(text || "")
    .split(" ")
    // The verses are fully vocalized, so a word left without nikud is an
    // editorial leftover - a ketiv form or a reference marker such as [8].
    // Those are skipped rather than read out and mispronounced.
    .filter((word) => NIKUD.test(word));
  if (!words.length) return [];

  const chunks = [];
  let i = 0;
  while (i < words.length) {
    const remaining = words.length - i;
    const take =
      remaining === LAST_CHUNK_IF_ONE_LEFT
        ? LAST_CHUNK_IF_ONE_LEFT
        : Math.min(SPEECH_CHUNK_WORDS, remaining);
    chunks.push(words.slice(i, i + take).join(" "));
    i += take;
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
    audio.playbackRate = PLAYBACK_RATE[speedLevel];
    currentAudio = audio;
    speechDone = resolve;
    audio.onended = () => {
      currentAudio = null;
      finishSpeech();
    };
    audio.onerror = () => {
      currentAudio = null;
      speechDone = null;
      reject(new Error("audio playback failed"));
    };
    audio.play().catch((error) => {
      currentAudio = null;
      speechDone = null;
      reject(error);
    });
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
    utterance.rate = 0.92 * PLAYBACK_RATE[speedLevel];
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
        setError(tr("speechError", reason));
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
      if (done || cancelled || paused || synth.speaking || synth.pending) return;
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
    } catch {
      // The server is optional: on any failure we degrade to browser speech
      // rather than interrupting the reading.
      if (serverSpeech === null) {
        serverSpeech = false;
        reportBrowserFallback();
      }
    }
  }

  if (cancelled || paused) return performance.now() - started;
  await speakWithBrowser(content);
  return performance.now() - started;
}

function renderChapter(n) {
  currentChapter = n;
  const verses = tehilim[String(n)] || [];
  els.title.textContent = tr("chapterTitle", chapterLabel(n));
  els.verses.replaceChildren(
    ...verses.map((verse, index) => {
      const paragraph = document.createElement("p");
      const number = document.createElement("span");
      paragraph.className = "verse";
      paragraph.dataset.index = index;
      number.className = "verse-num";
      number.textContent = index + 1;
      paragraph.append(number, cleanVerseText(verse));
      return paragraph;
    })
  );
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
  if (playing && !cancelled) return;
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

  while (segmentIndex < segments.length) {
    await waitWhilePaused();
    if (cancelled) return;

    const segment = segments[segmentIndex];
    if (segment.verseIndex !== shownVerse) {
      shownVerse = segment.verseIndex;
      highlightVerse(shownVerse);
    }
    if (segments[segmentIndex + 1]) prefetchAudio(segments[segmentIndex + 1].text);

    jumpRequested = false;
    const duration = await speak(segment.text);
    if (jumpRequested) {
      shownVerse = -1;
      continue;
    }
    // A pause re-reads the same piece so nothing is skipped mid-sentence.
    if (paused) continue;
    if (cancelled) return;

    await wait(duration * WAIT_AFTER_SPEECH[speedLevel]);
    if (jumpRequested) {
      shownVerse = -1;
      continue;
    }
    if (paused) {
      await waitWhilePaused();
      if (jumpRequested) {
        shownVerse = -1;
        continue;
      }
    }
    if (cancelled) return;

    segmentIndex += 1;
  }
}

// Reads a chapter plus the gap before the next one, re-reading when the user
// jumps back into the chapter during that gap.
async function readChapterAndGap(segments, chapter) {
  while (!cancelled) {
    await readSegments(segments);
    if (cancelled) return;
    els.status.textContent = tr("nextChapter");
    highlightVerse(-1);
    await wait(4000);
    if (paused) await waitWhilePaused();
    if (cancelled) return;
    if (!jumpRequested) return;
    els.status.textContent = tr("reading", chapterLabel(chapter), tr("speedNames")[speedLevel]);
  }
}

async function readLoop(startChapter) {
  playing = true;
  cancelled = false;
  paused = false;
  els.start.disabled = true;
  els.stop.disabled = false;
  if (els.change) els.change.disabled = false;
  els.input.disabled = true;
  setPauseResumeLabel(false);
  showFloatingControls(true);
  setError("");
  if (synth) synth.cancel();
  await refreshVoice();

  let chapter = startChapter;
  while (!cancelled) {
    await waitWhilePaused();
    if (cancelled) break;
    renderChapter(chapter);
    els.status.textContent = tr("reading", chapterLabel(chapter), tr("speedNames")[speedLevel]);
    const verses = tehilim[String(chapter)] || [];
    const segments = buildChapterSegments(verses);
    currentSegments = segments;
    segmentIndex = 0;
    if (segments.length) prefetchAudio(segments[0].text);
    await speak(`פרק ${hebrewLetters(chapter)}`);
    if (paused) {
      await waitWhilePaused();
      continue;
    }
    if (cancelled) break;

    await readChapterAndGap(segments, chapter);

    if (cancelled) break;
    chapter = chapter === 150 ? 1 : chapter + 1;
  }

  playing = false;
  paused = false;
  els.input.disabled = false;
  els.stop.disabled = true;
  if (els.change) els.change.disabled = true;
  setPauseResumeLabel(false);
  showFloatingControls(false);
  els.start.disabled = !currentChapter;
  els.status.textContent = cancelled ? tr("chooseChapter") : "";
  if (pendingRestart && currentChapter) {
    pendingRestart = false;
    readLoop(currentChapter);
  }
}

function pauseReading() {
  if (!playing || paused) return;
  paused = true;
  clearWait();
  haltPlayback();
  setPauseResumeLabel(true);
  els.status.textContent = tr("paused");
}

function resumeReading() {
  if (!playing || !paused) return;
  paused = false;
  setPauseResumeLabel(false);
  els.status.textContent = tr("reading", chapterLabel(currentChapter), tr("speedNames")[speedLevel]);
  if (resumeResolve) {
    const resolve = resumeResolve;
    resumeResolve = null;
    resolve();
  }
}

function togglePauseResume() {
  if (!playing) return;
  if (paused) resumeReading();
  else pauseReading();
}

function goBackVerse() {
  if (!playing || !currentSegments.length) return;

  const safeIndex = Math.min(segmentIndex, currentSegments.length - 1);
  const targetVerse = Math.max(0, currentSegments[safeIndex].verseIndex - 1);
  const target = currentSegments.findIndex((s) => s.verseIndex === targetVerse);
  if (target === -1) return;

  segmentIndex = target;
  jumpRequested = true;
  clearWait();
  haltPlayback();
  // Pressing back means "read it now", so a paused session starts again.
  if (paused) resumeReading();
}

function changeChapter() {
  if (!playing) return;
  pendingRestart = false;
  cancelled = true;
  paused = false;
  clearWait();
  haltPlayback();
  if (resumeResolve) {
    const resolve = resumeResolve;
    resumeResolve = null;
    resolve();
  }
  setPauseResumeLabel(false);
  els.input.disabled = false;
  els.input.focus();
  els.input.select();
  els.input.scrollIntoView({ behavior: "smooth", block: "center" });
  els.status.textContent = tr("changeHelp");
}

async function loadTehilim() {
  const embedded = document.getElementById("tehilim-data");
  if (embedded?.textContent.trim()) {
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
  if (!currentChapter) return;
  if (playing) {
    if (!cancelled) return;
    pendingRestart = true;
    return;
  }
  readLoop(currentChapter);
});
els.stop.addEventListener("click", togglePauseResume);
if (els.floatingStop) els.floatingStop.addEventListener("click", togglePauseResume);
if (els.change) els.change.addEventListener("click", changeChapter);
if (els.floatingChange) els.floatingChange.addEventListener("click", changeChapter);
if (els.floatingBack) els.floatingBack.addEventListener("click", goBackVerse);

function updateSpeedLabels() {
  const label = tr("speedActions")[speedLevel];
  if (els.speed) els.speed.textContent = label;
  if (els.floatingSpeed) els.floatingSpeed.textContent = label;
}

function toggleSpeed() {
  speedLevel = (speedLevel + 1) % WAIT_AFTER_SPEECH.length;
  updateSpeedLabels();
  if (playing && !paused) {
    els.status.textContent = tr(
      "reading",
      chapterLabel(currentChapter),
      tr("speedNames")[speedLevel]
    );
  }
}

if (els.speed) els.speed.addEventListener("click", toggleSpeed);
if (els.floatingSpeed) els.floatingSpeed.addEventListener("click", toggleSpeed);
els.language.addEventListener("change", () => {
  currentLanguage = els.language.value;
  localStorage.setItem("tehilim-language", currentLanguage);
  applyLanguage();
  showChapterFromInput();
});
applyLanguage();

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
    setError(tr("loadError"));
  });

function isStandaloneApp() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true
  );
}

function setupInstallPrompt() {
  if (!els.installBtn || !els.installNote) return;
  if (isStandaloneApp()) return;

  let deferredPrompt = null;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);

  if (ios) {
    els.installNote.classList.remove("hidden");
    els.installNote.textContent = tr("iosInstall");
    return;
  }

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event;
    els.installBtn.classList.remove("hidden");
    els.installNote.classList.remove("hidden");
    els.installNote.textContent = tr("installAvailable");
  });

  els.installBtn.addEventListener("click", async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    els.installBtn.classList.add("hidden");
    els.installNote.classList.add("hidden");
  });
}

setupInstallPrompt();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
