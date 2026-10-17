import { describe, expect, it } from "vitest";
import { hasRomaji, romajiToKana } from "../../src/domain/romaji";

describe("romaji readings", () => {
  it("recognizes Latin letters and leaves kana alone", async () => {
    expect(hasRomaji("kyou")).toBe(true);
    expect(hasRomaji("きょう")).toBe(false);
    expect(await romajiToKana("きょう")).toBe("きょう");
  });

  it("converts basic Hepburn, digraphs, sokuon and spaces", async () => {
    expect(await romajiToKana("kyou")).toBe("きょう");
    expect(await romajiToKana("kya")).toBe("きゃ");
    expect(await romajiToKana("gakkou")).toBe("がっこう");
    expect(await romajiToKana("kimi no")).toBe("きみ の");
  });

  it("keeps upper case and mixed input in hiragana", async () => {
    expect(await romajiToKana("KYOU")).toBe("きょう");
    expect(await romajiToKana("kyoう")).toBe("きょう");
  });
});
