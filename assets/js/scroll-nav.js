(function () {
  'use strict';

  var shell = document.querySelector('.s1');
  if (!shell) return;

  var lastScrollY = window.scrollY || window.pageYOffset || 0;
  var isHidden = false;
  var ticking = false;

  function setOffset() {
    document.documentElement.style.setProperty('--site-header-offset', shell.offsetHeight + 'px');
  }

  function showShell() {
    if (isHidden) {
      shell.classList.remove('is-hidden');
      isHidden = false;
    }
  }

  function hideShell() {
    if (!isHidden) {
      shell.classList.add('is-hidden');
      isHidden = true;
    }
  }

  function update() {
    var currentY = window.scrollY || window.pageYOffset || 0;

    if (currentY <= 8) {
      showShell();
    } else if (currentY > lastScrollY + 4) {
      hideShell();
    } else if (currentY < lastScrollY - 4) {
      showShell();
    }

    lastScrollY = currentY;
    ticking = false;
  }

  function onScroll() {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(update);
  }

  setOffset();
  update();
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', setOffset);
  window.addEventListener('load', setOffset);
})();
