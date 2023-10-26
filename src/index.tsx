import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './app';
import './index.scss';

// import './grid';
// import './help';
// import './overlay';
// import './scoreboard';

const container = document.querySelector('#app-root');
if (!container) {
    throw new Error('No main app-root div');
}

const root = createRoot(container);
root.render(<App />);
