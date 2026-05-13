// Provide TextEncoder / TextDecoder in the jest VM context.
// Jest's sandboxed module scope does not always inherit all Node.js globals,
// and jsdom's URL machinery (whatwg-url) requires these to be present.
const { TextEncoder, TextDecoder } = require("util");

if (typeof global.TextEncoder === "undefined") {
  global.TextEncoder = TextEncoder;
}
if (typeof global.TextDecoder === "undefined") {
  global.TextDecoder = TextDecoder;
}
