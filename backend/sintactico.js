import { CstParser } from "chevrotain";
import { allTokens, SensorLexer } from "./lexico.js";
import {
  LCurly, RCurly, Colon, Comma,
  StringLiteral, NumberLiteral, Identifier
} from "./lexico.js";

class SensorParser extends CstParser {
  constructor() {
    super(allTokens);
    const $ = this;

    $.RULE("sensorObject", () => {
      $.CONSUME(LCurly);
      $.SUBRULE($.propertyList);
      $.CONSUME(RCurly);
    });

    $.RULE("propertyList", () => {
      $.SUBRULE($.property);
      $.MANY(() => {
        $.CONSUME(Comma);
        $.SUBRULE2($.property);
      });
    });

    $.RULE("property", () => {
      $.CONSUME(Identifier);
      $.CONSUME(Colon);
      $.SUBRULE($.value);
    });

    $.RULE("value", () => {
      $.OR([
        { ALT: () => $.CONSUME(StringLiteral) },
        { ALT: () => $.CONSUME(NumberLiteral) },
        { ALT: () => $.CONSUME(Identifier) }
      ]);
    });

    this.performSelfAnalysis();
  }
}

// Función que conecta léxico + sintáctico
export function parseInput(text) {

  // Léxico
  const lexResult = SensorLexer.tokenize(text);

  if (lexResult.errors.length > 0) {
    return { lexErrors: lexResult.errors, tokens: lexResult.tokens };
  }

  // Crea el parser aquí
  const parserInstance = new SensorParser();

  parserInstance.input = lexResult.tokens;

  const cst = parserInstance.sensorObject();

  if (parserInstance.errors.length > 0) {
    return { parseErrors: parserInstance.errors, tokens: lexResult.tokens };
  }

  return { cst, tokens: lexResult.tokens };
}
