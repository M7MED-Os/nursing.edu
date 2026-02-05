const fs = require('fs');
const content = fs.readFileSync('assets/js/auth.js', 'utf8');

let openBraces = 0, closeBraces = 0;
let openParens = 0, closeParens = 0;
let openBrackets = 0, closeBrackets = 0;

let inString = false, stringChar = '';
let inSingleComment = false, inMultiComment = false;
let escape = false;

for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const nextChar = content[i + 1];

    if (escape) { escape = false; continue; }
    if (char === '\\') { escape = true; continue; }

    if (inSingleComment) {
        if (char === '\n') inSingleComment = false;
        continue;
    }
    if (inMultiComment) {
        if (char === '*' && nextChar === '/') { inMultiComment = false; i++; }
        continue;
    }

    if (inString) {
        if (char === stringChar) inString = false;
        continue;
    }

    if (char === '/' && nextChar === '/') { inSingleComment = true; i++; continue; }
    if (char === '/' && nextChar === '*') { inMultiComment = true; i++; continue; }

    if (char === "'" || char === '"' || char === '`') {
        inString = true;
        stringChar = char;
        continue;
    }

    if (char === '{') openBraces++;
    if (char === '}') closeBraces++;
    if (char === '(') openParens++;
    if (char === ')') closeParens++;
    if (char === '[') openBrackets++;
    if (char === ']') closeBrackets++;
}

console.log(`Braces: {:${openBraces}, }:${closeBraces}`);
console.log(`Parens: (:${openParens}, ):${closeParens}`);
console.log(`Brackets: [:${openBrackets}, ]:${closeBrackets}`);

if (openBraces !== closeBraces) console.log(`Brace Mismatch: ${openBraces - closeBraces}`);
if (openParens !== closeParens) console.log(`Paren Mismatch: ${openParens - closeParens}`);
if (openBrackets !== closeBrackets) console.log(`Bracket Mismatch: ${openBrackets - closeBrackets}`);
