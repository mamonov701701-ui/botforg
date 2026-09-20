# Block engineering contract

Production block functionality is never UI-only. Every production block must have an editor representation, settings validation, persistence contract, channel-neutral runtime behavior where applicable, simulator behavior, and focused regression tests. Simulator/runtime parity is mandatory for every user-observable execution path.

New canonical scenarios must write canonical block codes only. Legacy aliases (`variable`, `action`, `button`, and top-level types) are read-compatible migration boundaries and must not be used for new writes. `Action` is not a generic catch-all container.

Changes to block semantics require updates to this developer contract, the technical block-contract document, and user documentation when behavior is visible to customers. Once Registry/Passport exists, all new block types must pass through it.

## Future Block Passport rule

The author-provided section contains purpose, description, when-to-use guidance, examples, user guide, field help, and limitations. The system-derived section determines Generator and Copilot compatibility, supported channels, security class, allowed connections, runtime and simulator compatibility, duplicate/overlap status, and moderation status. Authors do not declare AI compatibility.

`user_guide` will be mandatory in a future Passport. After moderation, Passport plus User Guide will automatically publish into **Инструкции → Блоки**.

Future custom-block lifecycle: `create → passport → user guide → automatic validation → duplicate/overlap check → security review → moderation → registry → block library → automatic documentation publication`. Duplicate states are `UNIQUE`, `OVERLAP`, and `DUPLICATE`; a duplicate does not publish as a new block type.
