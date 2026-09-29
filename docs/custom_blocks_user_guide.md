# Custom Block JavaScript guide

Custom Block (кастомный блок) can use a small JavaScript function when the platform administrator enables secure execution. Define `function run(envelope)` and return `outputs`, a named `route`, and optional short logs.

The Wizard (мастер) presents all nine steps as responsive Tabs (адаптивные вкладки) attached to the current step card. You can open any available step directly, while Back and Next remain available. The active tab is visually connected to the form; a small red dot marks only a step with a blocking error. Correct steps have no extra status marker, and warnings remain inside the relevant step and final validation summary.

While editing a Draft (черновик), BotForg saves the complete draft and current step to the Backend (бэкенд) about four seconds after a change. The statuses are «Сохранение…», «Сохранено», and «Ошибка сохранения». The manual «Сохранить черновик» action remains available. Reloading or reopening restores the latest Backend Draft, which is the Source of Truth (источник истины).

Inputs and outputs are declared in the block form. A route must have the same name as one declared output. In EditorV2 connect each named output handle to the next block.

On step 3, enter human-readable input names. BotForg keeps that Display Name (отображаемое имя) and generates a separate lower-snake-case Machine Key (машинный ключ), including transliteration for Russian text. The generated key is what the JavaScript Execution Specification (спецификация выполнения JavaScript) receives; raw labels are never used as executable identifiers.

## Connections and routes

On step 4 choose 0 or 1 input and from 0 to 32 outputs. Thirty-two is a Technical Safety Limit (технический защитный предел), so it supports larger menus and routing without allowing an unlimited graph surface. Give every output a clear display name, such as «Успех» and «Ошибка». BotForg generates and shows a stable machine key, such as `success` and `error`; JavaScript returns this key in `route`.

More than one output requires `route`. Zero outputs make a terminal block and the result must not include a route. Connections, display names and machine keys are frozen after publication: use Create New Version (создать новую версию) for a changed contract. Earlier one-input/one-output blocks stay compatible.

BotForg creates the Machine Key (машинный ключ) automatically, including transliteration for Russian names and a numeric suffix for duplicates. Message fallback (резервное выполнение сообщением) supports no more than one output. For two or more outputs, explicitly enable JavaScript Runtime (выполнение JavaScript) on step 5 and return one of the shown Machine Keys in `route`.

You may use plain JavaScript calculations over the supplied `input` and `settings`. You may not use packages, imports, network requests, files, databases, secrets, system commands or platform APIs. The code has strict time and memory limits; long loops stop safely.

BotForg preserves JavaScript source exactly as entered, including line breaks and indentation. Preview (предпросмотр) sends the exact published version to the Backend Preview API (API серверного предпросмотра); the browser does not execute the source. The Backend authorizes the version and invokes the separate isolated Development Runner (раннер разработки).

Publishing makes the version and its code immutable. To change code, use Create New Version. Archive removes a block from new insertion but does not break an already saved scenario that references that exact version. Future review and marketplace access workflows are separate and are not part of this stage.
