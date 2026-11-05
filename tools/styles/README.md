# Site styles

The site loads the committed `assets/tailwind.css`. Tailwind does not run in the browser.

After adding or changing utility classes in site HTML, JavaScript, or document HTML:

```sh
npm ci
npm run build:css
npm test
```

Commit the generated stylesheet with the source change. GitHub Pages serves it directly; no server-side build is needed.

`tailwind.config.cjs` retains the original Tailwind 3.4.17 theme and dark mode. Its content paths cover every app. Document JSON contributes HTML class names without treating the complete law or book text as utility classes. Use complete class names in JavaScript rather than constructing utility names from fragments.

The lockfile pins the build dependencies. The test runner includes every existing `tests/*.cjs` file on Windows and Unix.
