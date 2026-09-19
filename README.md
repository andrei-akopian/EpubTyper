# [EpubTyper](https://andrei-akopian.github.io/EpubTyper)

[Github Repo](https://github.com/andrei-akopian/EpubTyper) | [Website](https://andrei-akopian.github.io/EpubTyper) | [MIT License](./LICENSE.md)

Book typing practice tool. Displays images and *italicised text*. You need to bring your own epubs. [Try it.](https://andrei-akopian.github.io/EpubTyper)

Progress auto-saves to localstorage, but epubs will be lost if you close the tab (to reduce disk usage). If you re-upload an epub you already typed, your progress will be restored.

Made by GPT-5.6 Luna and Kimi K2.7 using pure HTML+JS+CSS and `epub.js` library. Implementation is entirely client side, and can be served using any static site host.

## Similar Projects

- [TypeLit](https://www.typelit.io/) (freemium. Custom epub uploads are paywalled.)

Also heavily inspired and influenced by:
- [MonkeyType](https://monkeytype.com/)

Good sources of epubs:
- [Project Gutenberg](https://www.gutenberg.org/)
- [Standard eBooks](https://standardebooks.org/)

## Development

Because the code is split into ES modules, the site must be served over HTTP (not opened from `file://`).

```bash
git clone https://github.com/andrei-akopian/EpubTyper
cd EpubTyper
python -m http.server 8000
# open http://localhost:8000
```
