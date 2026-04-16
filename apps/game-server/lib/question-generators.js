// Backwards-compatible shim:
// The question engine was rebuilt and moved to a shared module so both the
// server and web (AI mode) can use one source of truth.
module.exports = require("../../../packages/shared/question-engine");
