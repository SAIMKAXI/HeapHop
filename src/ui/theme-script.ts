// The saved-theme check as source text, for an inline <script> that runs before the first
// paint. Kept apart from theme.ts so a server component can import it without React hooks.

export const THEME_STORAGE_KEY = "theme";

export const SAVED_THEME_SCRIPT = `try{if(localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)})==="light"){document.documentElement.classList.replace("dark","light")}}catch(e){}`;
