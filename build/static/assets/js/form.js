/* Kontakt forma.
 *
 * Postavi ENDPOINT na URL svog servisa za primanje formi (Formspree, Web3Forms,
 * Netlify Forms, vlastiti PHP…) i forma šalje poruku u pozadini.
 *
 * Ako ENDPOINT ostane prazan, forma otvara mail klijent s ispunjenom porukom —
 * radi odmah, ali korisnik mora sam pritisnuti "pošalji" u svom mail programu.
 */
(function () {
  'use strict';

  var ENDPOINT = '';                  // <— ovdje zalijepi URL
  var MAILTO = 'info@unimath.hr';

  var form = document.getElementById('kontakt-forma');
  if (!form) return;

  var status = document.getElementById('forma-status');
  var button = document.getElementById('forma-gumb');
  var buttonText = button ? button.textContent : 'Pošalji poruku';

  function say(text, state) {
    if (!status) return;
    status.textContent = text;
    status.setAttribute('data-stanje', state);
  }

  function busy(on) {
    if (!button) return;
    button.disabled = on;
    button.textContent = on ? 'Šaljem…' : buttonText;
    button.style.opacity = on ? '0.65' : '';
    button.style.cursor = on ? 'progress' : '';
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();

    if (!form.reportValidity()) return;

    var data = new FormData(form);

    // honeypot: popunjeno = bot
    if (data.get('website')) return;
    data.delete('website');

    if (!ENDPOINT) {
      var body =
        'Ime i prezime: ' + (data.get('ime') || '') + '\n' +
        'Email: ' + (data.get('email') || '') + '\n' +
        'Telefon: ' + (data.get('telefon') || '') + '\n\n' +
        (data.get('poruka') || '');
      window.location.href =
        'mailto:' + MAILTO +
        '?subject=' + encodeURIComponent('Upit s web stranice') +
        '&body=' + encodeURIComponent(body);
      say('Otvaramo vaš mail program s pripremljenom porukom.', 'ok');
      return;
    }

    busy(true);
    say('', '');

    fetch(ENDPOINT, {
      method: 'POST',
      body: data,
      headers: { Accept: 'application/json' },
    })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        form.reset();
        say('Hvala! Poruka je poslana — javljamo se u najkraćem roku.', 'ok');
      })
      .catch(function () {
        say('Slanje nije uspjelo. Pišite nam na ' + MAILTO + ' ili nazovite +385 91 240 4994.', 'greska');
      })
      .then(function () {
        busy(false);
      });
  });
})();
