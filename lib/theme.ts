// Runs before first paint; operating-system preference is the CSS default.
export const themeScript = `(function(){try{var m=localStorage.getItem('nool-appearance');if(m==='dark'||m==='light'){document.documentElement.dataset.mode=m;document.documentElement.style.colorScheme=m}}catch(e){}})()`;
