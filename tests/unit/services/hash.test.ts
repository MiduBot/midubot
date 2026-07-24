import { describe, it, expect } from "bun:test";
import { ImageHashService } from "@/features/images/services/hash.service";

describe("ImageHashService helpers", () => {
  describe("hammingDistance", () => {
    it("returns 0 for identical hashes", () => {
      const hash = "10101010";
      expect(ImageHashService.hammingDistance(hash, hash)).toBe(0);
    });

    it("counts differing bits", () => {
      expect(ImageHashService.hammingDistance("00000000", "11111111")).toBe(8);
      expect(ImageHashService.hammingDistance("00000000", "00001111")).toBe(4);
      expect(ImageHashService.hammingDistance("10101010", "10101011")).toBe(1);
    });

    it("returns MAX_VALUE for mismatched lengths", () => {
      expect(ImageHashService.hammingDistance("1010", "10101010")).toBe(
        Number.MAX_VALUE,
      );
    });

    it("returns MAX_VALUE for empty hashes", () => {
      expect(ImageHashService.hammingDistance("", "1010")).toBe(
        Number.MAX_VALUE,
      );
    });
  });

  describe("colorDistance", () => {
    it("returns 0 for identical signatures", () => {
      expect(ImageHashService.colorDistance("ff00aa", "ff00aa")).toBe(0);
    });

    it("returns 255 for mismatched lengths", () => {
      expect(ImageHashService.colorDistance("ff00aa", "ff00aabb")).toBe(255);
    });

    it("computes average channel difference", () => {
      // b1 = [255, 0, 0], b2 = [0, 255, 0]
      // diff sum = 255 + 255 + 0 = 510; avg = 170
      expect(ImageHashService.colorDistance("ff0000", "00ff00")).toBe(170);
    });

    it("returns 255 for invalid hex", () => {
      expect(ImageHashService.colorDistance("zzzzzz", "000000")).toBe(255);
    });
  });

  describe("compareLegacyDHash", () => {
    it("marks similar when distance is within threshold", () => {
      const result = ImageHashService.compareLegacyDHash(
        "0000000000000000",
        "0000000000000001",
        2,
      );
      expect(result.isSimilar).toBe(true);
      expect(result.details.mode).toBe("legacy");
      expect(result.details.dhashDist).toBe(1);
    });

    it("marks not similar when distance exceeds threshold", () => {
      const result = ImageHashService.compareLegacyDHash(
        "0000000000000000",
        "1111111111111111",
        6,
      );
      expect(result.isSimilar).toBe(false);
      expect(result.details.dhashDist).toBe(16);
    });

    it("uses the default threshold when none is provided", () => {
      const result = ImageHashService.compareLegacyDHash(
        "0000000000000000",
        "0000000000000001",
      );
      expect(result.isSimilar).toBe(true);
    });
  });
});
