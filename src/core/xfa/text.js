/* Copyright 2021 Mozilla Foundation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const WIDTH_FACTOR = 1.2;
const HEIGHT_FACTOR = 1.2;

class FontInfo {
  constructor(xfaFont, fonts) {
    if (!xfaFont) {
      [this.pdfFont, this.xfaFont] = this.defaultFont(fonts);
      return;
    }

    this.xfaFont = xfaFont;
    let typeface = fonts[xfaFont.typeface];
    if (!typeface) {
      typeface = fonts[`${xfaFont.typeface}-PdfJS-XFA`];
    }
    if (!typeface) {
      [this.pdfFont, this.xfaFont] = this.defaultFont(fonts);
      return;
    }

    this.pdfFont = null;
    if (xfaFont.posture === "italic") {
      if (xfaFont.weight === "bold") {
        this.pdfFont = typeface.bolditalic;
      } else {
        this.pdfFont = typeface.italic;
      }
    } else if (xfaFont.weigth === "bold") {
      this.pdfFont = typeface.bold;
    } else {
      this.pdfFont = typeface.regular;
    }

    if (!this.pdfFont) {
      [this.pdfFont, this.xfaFont] = this.defaultFont(fonts);
    }
  }

  defaultFont(fonts) {
    // TODO: Add a default font based on Liberation.
    const font =
      fonts.Helvetica ||
      fonts["Myriad Pro"] ||
      fonts.Arial ||
      fonts.ArialMT ||
      Object.values(fonts)[0];
    const pdfFont = font.regular;
    const info = this.pdfFont.cssFontInfo;
    const xfaFont = {
      typeface: info.fontFamily,
      posture: "normal",
      weight: "normal",
      size: 10,
    };
    return [pdfFont, xfaFont];
  }
}

class FontSelector {
  constructor(defaultXfaFont, fonts) {
    this.fonts = fonts;
    this.stack = [new FontInfo(defaultXfaFont, fonts)];
  }

  pushFont(xfaFont) {
    const lastFont = this.stack[this.stack.length - 1];
    for (const name of ["typeface", "posture", "weight", "size"]) {
      if (!xfaFont[name]) {
        xfaFont[name] = lastFont.xfaFont[name];
      }
    }

    const fontInfo = new FontInfo(xfaFont, this.fonts);
    if (!fontInfo.pdfFont) {
      fontInfo.pdfFont = lastFont.pdfFont;
    }
    this.stack.push(fontInfo);
  }

  popFont() {
    this.stack.pop();
  }

  topFont() {
    return this.stack[this.stack.length - 1];
  }
}

/**
 * Compute a text area dimensions based on font metrics.
 */
class TextMeasure {
  constructor(defaultXfaFont, fonts) {
    this.glyphs = [];
    this.fontSelector = new FontSelector(defaultXfaFont, fonts);
  }

  pushFont(xfaFont) {
    return this.fontSelector.pushFont(xfaFont);
  }

  popFont(xfaFont) {
    return this.fontSelector.popFont();
  }

  addString(str) {
    if (!str) {
      return;
    }

    const lastFont = this.fontSelector.topFont();
    const pdfFont = lastFont.pdfFont;
    const fontSize = lastFont.xfaFont.size;
    const lineHeight = Math.round(Math.max(1, pdfFont.lineHeight) * fontSize);
    const scale = fontSize / 1000;

    for (const line of str.split(/[\u2029\n]/)) {
      const encodedLine = pdfFont.encodeString(line).join("");
      const glyphs = pdfFont.charsToGlyphs(encodedLine);

      for (const glyph of glyphs) {
        this.glyphs.push([
          glyph.width * scale,
          lineHeight,
          glyph.unicode === " ",
          false,
        ]);
      }

      this.glyphs.push([0, 0, false, true]);
    }

    this.glyphs.pop();
  }

  compute(maxWidth) {
    let lastSpacePos = -1,
      lastSpaceWidth = 0,
      width = 0,
      height = 0,
      currentLineWidth = 0,
      currentLineHeight = 0;

    for (let i = 0, ii = this.glyphs.length; i < ii; i++) {
      const [glyphWidth, glyphHeight, isSpace, isEOL] = this.glyphs[i];
      if (isEOL) {
        width = Math.max(width, currentLineWidth);
        currentLineWidth = 0;
        height += currentLineHeight;
        currentLineHeight = glyphHeight;
        lastSpacePos = -1;
        lastSpaceWidth = 0;
        continue;
      }

      if (isSpace) {
        if (currentLineWidth + glyphWidth > maxWidth) {
          // We can break here but the space is not taken into account.
          width = Math.max(width, currentLineWidth);
          currentLineWidth = 0;
          height += currentLineHeight;
          currentLineHeight = glyphHeight;
          lastSpacePos = -1;
          lastSpaceWidth = 0;
        } else {
          currentLineHeight = Math.max(glyphHeight, currentLineHeight);
          lastSpaceWidth = currentLineWidth;
          currentLineWidth += glyphWidth;
          lastSpacePos = i;
        }
        continue;
      }

      if (currentLineWidth + glyphWidth > maxWidth) {
        // We must break to the last white position (if available)
        height += currentLineHeight;
        currentLineHeight = glyphHeight;
        if (lastSpacePos !== -1) {
          i = lastSpacePos;
          width = Math.max(width, lastSpaceWidth);
          currentLineWidth = 0;
          lastSpacePos = -1;
          lastSpaceWidth = 0;
        } else {
          // Just break in the middle of the word
          width = Math.max(width, currentLineWidth);
          currentLineWidth = glyphWidth;
        }
        continue;
      }

      currentLineWidth += glyphWidth;
      currentLineHeight = Math.max(glyphHeight, currentLineHeight);
    }

    width = Math.max(width, currentLineWidth);
    height += currentLineHeight;

    return { width: WIDTH_FACTOR * width, height: HEIGHT_FACTOR * height };
  }
}

export { TextMeasure };
