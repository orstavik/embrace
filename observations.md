# Observations

The following are findings and limitations observed during the development and testing of the Embrace template engine:

- **ID Naming Restriction (view-root)**: The ID `view-root` cannot be used for the target element. Instead, `view` must be used.
- **ID Character Restriction**: The hyphen character `-` is not supported in IDs.
- **Arrow Functions**: Arrow functions are not supported inside Handlebars templates.
- **Comments Handling**: Comments within the templates are not getting ignored; they are being compiled, which can lead to errors.
- **Compilation Robustness**: If an error occurs during compilation, the process crashes, resulting in only a partially compiled output instead of a graceful failure or recovery.
- **JS Methods in Templates**: JavaScript methods like `toUpperCase()` and `toLowerCase()` are not working when used within template expressions (e.g., `{{user.role.toUpperCase()}}` or `{{emp.status.toLowerCase()}}`).
- **Template Tag Requirement for `for` and `if`**: The engine does not support `for` or `if` attributes on regular HTML elements (e.g., `<div for="member of group.members">` or `<div if="age >= 18 && verified">`). These directives must be placed on `<template>` tags to function correctly.

