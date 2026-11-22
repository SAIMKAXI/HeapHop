// Source text for the inline script that turns scroll reveals on before the first paint.
// Kept apart from scroll-reveal.tsx so the server layout can import it without React.
// It does nothing for visitors who asked for reduced motion, and switches reveals off again
// if the page's JavaScript never starts, so content can never stay hidden.

export const REVEAL_READY_SCRIPT = `try{var h=document.documentElement;if(!matchMedia("(prefers-reduced-motion: reduce)").matches){h.setAttribute("data-reveal","");setTimeout(function(){if(h.getAttribute("data-reveal")!=="live")h.removeAttribute("data-reveal")},4000)}}catch(e){}`;
