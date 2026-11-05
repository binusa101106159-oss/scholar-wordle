// Keep this theme identical to the site's original Tailwind 3.4.17 theme.
const theme = {
        darkMode: 'class',
        theme: {
          extend: {
            fontFamily: {
              sans: ['Roboto', 'system-ui', '-apple-system', 'sans-serif'],
              serif: ['Roboto', 'system-ui', 'sans-serif'],
            },
            colors: {
              oxford: {
                navy: '#002147',
                deep: '#00152e',
                gold: '#c5a059',
                goldlight: '#e2c58a',
                cream: '#f9f6f0',
                parchment: '#efe9dd'
              }
            }
          }
        }
      };
module.exports = {...theme, content: {
  files: ['./index.html', './*.js', './{ama,calculator,cases,epi-pbl,guides,health,ilo,laws,notes,review,sync}/**/*.{html,js,json}'],
  // Native document HTML can contain utility classes. Ignore document prose.
  transform: {json: source => Array.from(source.matchAll(/(?:class|className)\s*=\s*\\?["']([^"'\\]*)/g), match => match[1]).join(' ')}
}};
