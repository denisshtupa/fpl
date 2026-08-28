import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

if ('scrollRestoration' in history) {
  history.scrollRestoration = 'manual';
}

bootstrapApplication(App, appConfig)
  .catch((err) => console.error(err));
