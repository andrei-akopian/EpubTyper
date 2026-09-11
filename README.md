Typing practice tool using epub as text source.

Required features:
- [x] display special text properly, or close to properly.
- [x] typing progress saving
- [x] load epubs
- [x] web UI
- [x] page with typing speed stats
- [x] automatically clean or virtually replace spaces and non-qwerty keyboard characters to be skipped, spaces and newlines to be short. Take steps to prevent the user from needing to type non-latin characters. For now target is English with standard English keyboard.

## Sample implementation

This repository is a dependency-free client-side prototype. It starts with a short sample book and accepts standard `.epub` files through the **Load an EPUB** control. EPUB files are opened locally in the browser; no book content is uploaded.

Run it from the project directory with any static file server, for example:

```sh
python3 -m http.server 4173
```

Then open `http://localhost:4173`.

The prototype stores typing position, session history, and stats in `localStorage`. It uses the browser's ZIP and XML APIs directly instead of bundling epub.js so the sample stays small and easy to inspect.
