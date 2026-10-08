/* ==========================================================================
   50 · FORMULARIO DE PRESUPUESTO
   - Validación en el navegador con mensajes accesibles (aria-invalid + texto).
   - Barra de avance según los cinco campos obligatorios.
   - Envío: la solicitud se guarda en Firestore mediante su API REST (sin SDK).
     Si la base de datos aún no está configurada (sin apiKey en src/site.json) o
     falla el envío, se ofrece el correo electrónico como alternativa.
   - Antispam: campo trampa y tiempo mínimo de rellenado.
   Sin JavaScript, el formulario abre el programa de correo (action="mailto:").
   ========================================================================== */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_PATTERN = /^[+\d\s().-]{6,40}$/;
const REQUEST_TIMEOUT_MS = 15000;

/** Convierte un objeto simple al formato de valores tipados de la API REST de Firestore. */
function toFirestoreFields(data) {
  const fields = {};
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      fields[key] = { arrayValue: { values: value.map((item) => ({ stringValue: String(item) })) } };
    } else if (typeof value === 'number') {
      fields[key] = { integerValue: String(Math.trunc(value)) };
    } else if (value instanceof Date) {
      fields[key] = { timestampValue: value.toISOString() };
    } else {
      fields[key] = { stringValue: String(value) };
    }
  }
  return fields;
}

/** Guarda la solicitud en la colección configurada. Lanza un error si no se puede. */
async function saveRequest(config, data) {
  const url =
    `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(config.projectId)}` +
    `/databases/(default)/documents/${encodeURIComponent(config.collection)}` +
    `?key=${encodeURIComponent(config.apiKey)}`;

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: toFirestoreFields(data) }),
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`Firestore respondió ${response.status}`);
  } finally {
    window.clearTimeout(timer);
  }
}

function initQuoteForm() {
  const form = $('[data-quote-form]');
  if (!form) return;

  const config = readJson('form-config');
  const success = $('[data-form-success]');
  const status = $('[data-form-status]', form);
  const submit = $('[data-submit]', form);
  const submitLabel = $('[data-submit-label]', form);
  const progressText = $('[data-progress-text]', form);
  const progressBar = $('[data-progress-bar]', form);
  const originalLabel = submitLabel.textContent;
  const loadedAt = Date.now();

  // Con JavaScript la validación y sus mensajes los gestionamos nosotros
  form.noValidate = true;

  /* ---------- Reglas de validación: devuelven la clave del error o "" ---------- */

  const rules = {
    'f-name': (value) => (value.trim() ? '' : 'required'),
    'f-company': (value) => (value.trim() ? '' : 'required'),
    'f-email': (value) => (!value.trim() ? 'required' : EMAIL_PATTERN.test(value.trim()) ? '' : 'email'),
    'f-phone': (value) => (!value.trim() || PHONE_PATTERN.test(value.trim()) ? '' : 'phone'),
    'f-pieces': (value) => {
      if (!value.trim()) return '';
      const number = Number(value);
      return Number.isInteger(number) && number >= 1 && number <= 100000000 ? '' : 'pieces';
    },
    'f-message': (value) => (value.trim().length >= 10 ? '' : 'message'),
    'f-privacy': (_value, element) => (element.checked ? '' : 'privacy')
  };

  const REQUIRED_FIELDS = ['f-name', 'f-company', 'f-email', 'f-message', 'f-privacy'];

  const check = (element) => {
    const rule = rules[element.id];
    return rule ? rule(element.value, element) : '';
  };

  const paint = (element, errorKey) => {
    const message = $(`[data-error-for="${element.id}"]`, form);
    if (errorKey) {
      element.setAttribute('aria-invalid', 'true');
      if (message) message.textContent = text(`form.errors.${errorKey}`);
    } else {
      element.removeAttribute('aria-invalid');
      if (message) message.textContent = '';
    }
  };

  const updateProgress = () => {
    const done = REQUIRED_FIELDS.filter((id) => !check(doc.getElementById(id))).length;
    const percent = Math.round((done / REQUIRED_FIELDS.length) * 100);
    if (progressText) progressText.textContent = `${percent} %`;
    if (progressBar) progressBar.style.width = `${percent}%`;
  };

  const showStatus = (message, kind = 'info', mailHref = '') => {
    status.hidden = false;
    status.className = `form__status${kind === 'error' ? ' is-error' : ''}`;
    status.textContent = '';

    // El correo de contacto se inserta como enlace (los textos traducidos llevan {email})
    const [before, after] = message.split('{email}');
    status.append(doc.createTextNode(before));
    if (after !== undefined) {
      const link = doc.createElement('a');
      link.href = mailHref || `mailto:${config.email}`;
      link.textContent = config.email;
      status.append(link, doc.createTextNode(after));
    }
  };

  const hideStatus = () => {
    status.hidden = true;
    status.textContent = '';
  };

  /* ---------- Eventos de edición ---------- */

  form.addEventListener('input', (event) => {
    const element = event.target;
    if (element.id in rules) {
      element.dataset.touched = 'true';
      // Si el campo ya mostraba un error, se revalida mientras se escribe
      if (element.getAttribute('aria-invalid') === 'true') paint(element, check(element));
    }
    updateProgress();
  });

  form.addEventListener('change', (event) => {
    const element = event.target;
    if (element.id in rules) {
      element.dataset.touched = 'true';
      paint(element, check(element));
    }
    updateProgress();
  });

  // Al salir de un campo que la persona ya ha tocado se muestra su error, si lo hay
  form.addEventListener('focusout', (event) => {
    const element = event.target;
    if (element.id in rules && element.dataset.touched) paint(element, check(element));
  });

  /* ---------- Recogida de datos ---------- */

  const optionText = (select) => select.options[select.selectedIndex]?.textContent.trim() || '';
  const labelOf = (id) => $(`label[for="${id}"]`, form)?.textContent.trim() || id;

  const collect = () => {
    const data = new FormData(form);
    const get = (name) => String(data.get(name) ?? '').trim();
    const pieces = get('pieces');
    return {
      name: get('name'),
      company: get('company'),
      email: get('email'),
      phone: get('phone'),
      technology: get('technology'),
      projectType: get('projectType'),
      pieces: pieces ? Number(pieces) : null,
      date: get('date'),
      message: get('message'),
      services: data.getAll('services').map(String),
      lang: config.lang || lang,
      page: window.location.pathname,
      createdAt: new Date(),
      website: get('website')
    };
  };

  /** Correo preparado con todos los datos (alternativa cuando no se puede guardar en la base de datos). */
  const mailLink = () => {
    const company = $('#f-company').value.trim();
    const typeChoice = $('input[name="projectType"]:checked', form);
    const typeLegend = $('.choice-group legend', form).textContent.trim();
    const typeName = typeChoice ? $('strong', typeChoice.closest('.choice-card')).textContent.trim() : '';
    const servicesLegend = $('.chips', form).closest('fieldset').querySelector('legend').textContent.trim();
    const services = $$('input[name="services"]:checked', form).map((input) => labelOf(input.id)).join(', ');

    const lines = [
      `${labelOf('f-name')}: ${$('#f-name').value.trim()}`,
      `${labelOf('f-company')}: ${company}`,
      `${labelOf('f-email')}: ${$('#f-email').value.trim()}`,
      `${labelOf('f-phone')}: ${$('#f-phone').value.trim()}`,
      `${labelOf('f-technology')}: ${optionText($('#f-technology'))}`,
      `${typeLegend}: ${typeName}`,
      `${labelOf('f-pieces')}: ${$('#f-pieces').value.trim()}`,
      `${labelOf('f-date')}: ${$('#f-date').value}`,
      `${servicesLegend}: ${services}`,
      '',
      $('#f-message').value.trim()
    ];
    const subject = fill(text('form.mailSubject'), { company });
    return `mailto:${config.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join('\r\n'))}`;
  };

  /* ---------- Envío ---------- */

  const setSending = (sending) => {
    submit.disabled = sending;
    submitLabel.textContent = sending ? text('form.sending') : originalLabel;
    form.setAttribute('aria-busy', sending ? 'true' : 'false');
  };

  const showSuccess = () => {
    hideStatus();
    form.hidden = true;
    success.hidden = false;
    success.focus({ preventScroll: true });
    success.scrollIntoView({ block: 'center', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  };

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const invalid = [];
    for (const id of Object.keys(rules)) {
      const element = doc.getElementById(id);
      const errorKey = check(element);
      paint(element, errorKey);
      if (errorKey) invalid.push(element);
    }
    if (invalid.length > 0) {
      showStatus(text('form.invalid'), 'error');
      invalid[0].focus();
      return;
    }

    const data = collect();

    // Antispam: un robot rellena el campo trampa o envía el formulario al instante.
    // Se simula el éxito para no darle pistas.
    if (data.website || Date.now() - loadedAt < 1500) {
      showSuccess();
      return;
    }

    const configured = Boolean(config.apiKey && config.projectId);
    if (!configured) {
      // Base de datos sin configurar: se abre el correo con la solicitud preparada
      showStatus(text('form.mailOpened'), 'info');
      window.location.href = mailLink();
      return;
    }

    setSending(true);
    showStatus(text('form.sendingStatus'), 'info');
    try {
      const record = { ...data };
      delete record.website;
      await saveRequest(config, record);
      showSuccess();
    } catch {
      showStatus(text('form.failed'), 'error', mailLink());
    } finally {
      setSending(false);
    }
  });

  /* ---------- Enviar otra solicitud ---------- */

  const reset = $('[data-form-reset]');
  if (reset) {
    reset.addEventListener('click', () => {
      form.reset();
      $$('[aria-invalid]', form).forEach((element) => paint(element, ''));
      updateProgress();
      success.hidden = true;
      form.hidden = false;
      $('#f-name').focus();
    });
  }

  updateProgress();
}
