# Block contracts foundation

## Final 7.6A scope

Canonical production blocks are Start, Message (including button interaction metadata), Input, Condition, Set Variable, and End. The connection matrix is: Start `0 in / 0..1 out`, Message/Input `0+ in / contract-defined out`, Condition `0+ in / 0..2 out` through `condition_yes` and `condition_no`, Set Variable `0+ in / 0..1 out`, and End `0+ in / 0 out`. Scenario persistence keeps the React Flow graph and never silently rewrites legacy content. Publish is the strict canonical validation boundary; draft autosave remains permissive.

7.6A.1 defines static contracts only; it is not a Block Registry or Passport. Canonical codes are `start`, `message`, `input`, `condition`, `set_variable`, and `end`. Buttons are Message interaction metadata, not a block code.

Legacy aliases are `variable` → `set_variable`, `button` → Message compatibility, and `action` legacy-only. Scenario content is classified canonical (all `data.blockId`), legacy (old top-level `type`/shape), or `mixed_unsafe`; mixed content is never guessed.

Canonical validation requires exactly one Start, rejects unknown codes, forbids incoming Start edges and outgoing End edges, caps Start/Set Variable outgoing edges at one, and permits only unique `condition_yes` / `condition_no` condition handles. Publish invokes this foundation: legacy content keeps its explicit compatibility path while canonical and mixed-unsafe invalid graphs are rejected.

Start discovery is shared semantically across the channel runtime, general runtime and simulator. A canonical graph must have exactly one `data.blockId == "start"`; missing or duplicate Start fails closed. A legacy graph retains its compatibility fallback to its explicit legacy start or first node. A mixed graph is rejected without guessing an entry node.

End is an explicit terminal with no settings. EditorV2 renders only its incoming handle and prevents outgoing connections; persisted invalid outgoing edges remain diagnosable rather than being silently removed. The simulator, channel runtime and general runtime stop at End without resolving a next edge. Legacy nodes without outgoing edges remain valid terminal behavior.

Variable metadata is minimal: Input and Set Variable write session variables, Condition reads one, and Message reads interpolation values. Keys and execution semantics remain implemented by their existing layers.

`set_variable` is the sole canonical mutation block. Its settings are `key`, `value`, `value_type` (`string`, `number`, `boolean`, `json`), `interpolation`, and `overwrite` (default `true`). Keys use lowercase snake_case; booleans accept only booleans or `true`/`false`; JSON must parse. It has any number of incoming edges and at most one outgoing edge. Values are session-scoped. Simulator and channel runtime apply the same conversion and overwrite rules. Legacy `variable` is read as a compatibility alias and is never written for new blocks. A legacy `action` is adapted only when it is an unambiguous `setVariable` + `value` mutation with no message or other action semantics; otherwise it remains legacy Action behavior. Action is not a new generic catch-all. Developer-facing registry/passport guidance remains deferred to 7.6A.5.

Input remains one block with `validation.type` of `string`, `number`, `email`, `phone`, or `date`; it stores the successful value under `variable_key`. Invalid input stays on the Input node unless its explicit `error` edge is configured. Numbers use an ASCII decimal format without locale substitution. Condition uses only `condition_yes` and `condition_no`; its operators are `equals`, `notEquals`, `contains`, `greaterThan`, `lessThan`, `isEmpty`, and `isNotEmpty`. String operands are trimmed, equality allows numeric equivalence, comparisons are numeric-only, and a missing variable is empty-like. A missing selected branch terminates instead of falling back to the opposite branch. Buttons remain Message interaction metadata; their routing remains channel-neutral through adapter output, with legacy button data read-compatible.
