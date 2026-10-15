import { TokenizerBuilder } from "@patdx/kuromoji";
import { lineSpans, lineWords, type ReadingSpan, type Word } from "./align";

// The IPADIC dictionary ships with the app; it is fetched only on first use.
const files = import.meta.glob<string>(
  "../../node_modules/@patdx/kuromoji/dict/*.dat.gz",
  { query: "?url", import: "default", eager: true },
);
const urls = new Map(
  Object.entries(files).map(([path, url]) => [path.split("/").pop()!, url]),
);

async function load(name: string): Promise<ArrayBuffer> {
  const url = urls.get(name);
  if (!url) throw new Error(`缺少日语词典文件 ${name}。`);
  const response = await fetch(url);
  if (!response.ok)
    throw new Error(`日语词典 ${name} 加载失败（${response.status}）。`);
  const data = new Uint8Array(await response.arrayBuffer());
  // A server may already have undone the gzip through Content-Encoding.
  if (data[0] !== 0x1f || data[1] !== 0x8b) return data.buffer;
  const stream = new Blob([data])
    .stream()
    .pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).arrayBuffer();
}

type Tokenizer = Awaited<ReturnType<TokenizerBuilder["build"]>>;
let tokenizer: Promise<Tokenizer> | null = null;
function ready(): Promise<Tokenizer> {
  tokenizer ??= new TokenizerBuilder({
    loader: { loadArrayBuffer: load },
  })
    .build()
    .catch((error) => {
      tokenizer = null;
      throw error;
    });
  return tokenizer;
}
export async function japaneseReader(): Promise<
  (text: string) => ReadingSpan[]
> {
  const analyzer = await ready();
  return (text) => lineSpans(analyzer.tokenize(text));
}
/** Word boundaries for romaji spacing, with the particles read as wa, o and e. */
export async function japaneseWords(): Promise<(text: string) => Word[]> {
  const analyzer = await ready();
  return (text) => lineWords(analyzer.tokenize(text));
}
