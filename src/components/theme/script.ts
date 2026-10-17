/** localStorage key for the manual theme override ("light" | "dark"). Absent = follow the system. */
export const THEME_KEY = "napkin:theme";

/**
 * Runs synchronously in <head> before first paint so a saved override never
 * flashes the wrong theme. Kept tiny and dependency-free on purpose.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(
  THEME_KEY,
)});if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`;
