import '@fontsource-variable/oswald';
import '@fontsource-variable/sofia-sans';
import './ui/base.css';
import './ui/game.css';
import './ui/screens.css';
import { App } from './app/App';

new App().init().catch((err) => {
  console.error(err);
  document.body.insertAdjacentHTML('beforeend', `<pre style="position:fixed;inset:auto 0 0 0;padding:12px;background:#fff;color:#c00;white-space:pre-wrap;z-index:999">${String(err?.stack ?? err)}</pre>`);
});
