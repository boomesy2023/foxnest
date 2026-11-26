export interface DictionaryEntry {
  word: string;
  phonetic: string;
  definition: string;
}

type DictionaryData = Record<string, [string, string]>;

let dictionaryPromise: Promise<DictionaryData> | null = null;

function loadDictionary(): Promise<DictionaryData> {
  if (!dictionaryPromise) {
    dictionaryPromise = fetch("/dictionary/en-zh.json")
      .then(async (response) => {
        if (!response.ok) throw new Error("内置词典加载失败");
        return response.json() as Promise<DictionaryData>;
      })
      .catch((error) => {
        dictionaryPromise = null;
        throw error;
      });
  }
  return dictionaryPromise;
}

function normalizeWord(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/^[^a-z]+|[^a-z'-]+$/g, "")
    .replace(/^['-]+|['-]+$/g, "");
}

function entryFrom(word: string, value: [string, string]): DictionaryEntry {
  return { word, phonetic: value[0], definition: value[1] };
}

export async function lookupDictionary(query: string): Promise<DictionaryEntry | null> {
  const word = normalizeWord(query);
  if (!word) return null;
  const dictionary = await loadDictionary();
  const exact = dictionary[word];
  if (exact) return entryFrom(word, exact);

  const candidates: string[] = [];
  if (word.endsWith("ies") && word.length > 4) candidates.push(`${word.slice(0, -3)}y`);
  if (word.endsWith("es") && word.length > 3) candidates.push(word.slice(0, -2));
  if (word.endsWith("s") && !word.endsWith("ss") && word.length > 2) candidates.push(word.slice(0, -1));
  if (word.endsWith("ied") && word.length > 4) candidates.push(`${word.slice(0, -3)}y`);
  if (word.endsWith("ed") && word.length > 3) candidates.push(word.slice(0, -2), `${word.slice(0, -1)}e`);
  if (word.endsWith("ing") && word.length > 4) {
    candidates.push(word.slice(0, -3), `${word.slice(0, -3)}e`, word.slice(0, -4));
  }
  if (word.endsWith("ly") && word.length > 3) candidates.push(word.slice(0, -2), `${word.slice(0, -2)}e`);
  if (word.endsWith("er") && word.length > 3) candidates.push(word.slice(0, -2), `${word.slice(0, -1)}e`);
  if (word.endsWith("est") && word.length > 4) candidates.push(word.slice(0, -3), `${word.slice(0, -2)}e`);

  for (const candidate of candidates) {
    const value = dictionary[candidate];
    if (value) return entryFrom(candidate, value);
  }
  return null;
}
