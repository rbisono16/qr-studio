import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

type ErrorLevel = 'L' | 'M' | 'Q' | 'H';
type QrType = 'url' | 'text' | 'email' | 'phone' | 'sms' | 'wifi' | 'vcard';

type FormState = {
  url: string;
  text: string;
  email: string;
  emailSubject: string;
  emailBody: string;
  phone: string;
  smsPhone: string;
  smsMessage: string;
  wifiSsid: string;
  wifiPassword: string;
  wifiSecurity: 'WPA' | 'WEP' | 'nopass';
  wifiHidden: boolean;
  vcardFirstName: string;
  vcardLastName: string;
  vcardOrg: string;
  vcardTitle: string;
  vcardPhone: string;
  vcardEmail: string;
  vcardWebsite: string;
};

type StringFormKey = {
  [K in keyof FormState]: FormState[K] extends string ? K : never;
}[keyof FormState];

const qrTypeOptions: Array<{ id: QrType; title: string; description: string }> = [
  { id: 'url', title: 'URL', description: 'Lleva a una pagina web o landing.' },
  { id: 'text', title: 'Texto', description: 'Guarda texto simple o una nota.' },
  { id: 'email', title: 'Email', description: 'Prepara un correo con asunto.' },
  { id: 'phone', title: 'Telefono', description: 'Permite llamar al instante.' },
  { id: 'sms', title: 'SMS', description: 'Abre un mensaje prellenado.' },
  { id: 'wifi', title: 'Wi-Fi', description: 'Conecta a una red rapidamente.' },
  { id: 'vcard', title: 'vCard', description: 'Comparte un contacto completo.' },
];

const fieldLimits: Record<StringFormKey, number> = {
  url: 1024,
  text: 500,
  email: 254,
  emailSubject: 100,
  emailBody: 280,
  phone: 24,
  smsPhone: 24,
  smsMessage: 160,
  wifiSsid: 32,
  wifiPassword: 63,
  wifiSecurity: 10,
  vcardFirstName: 40,
  vcardLastName: 40,
  vcardOrg: 80,
  vcardTitle: 60,
  vcardPhone: 24,
  vcardEmail: 254,
  vcardWebsite: 512,
};

const multilineFields: StringFormKey[] = ['text', 'emailBody', 'smsMessage'];

const initialFormState: FormState = {
  url: '',
  text: '',
  email: '',
  emailSubject: '',
  emailBody: '',
  phone: '',
  smsPhone: '',
  smsMessage: '',
  wifiSsid: '',
  wifiPassword: '',
  wifiSecurity: 'WPA',
  wifiHidden: false,
  vcardFirstName: '',
  vcardLastName: '',
  vcardOrg: '',
  vcardTitle: '',
  vcardPhone: '',
  vcardEmail: '',
  vcardWebsite: '',
};

function escapeVCardValue(value: string) {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,');
}

function sanitizeStringInput(key: StringFormKey, value: string) {
  const preserveNewLines = multilineFields.includes(key);
  const withoutUnsafeControls = value.replace(
    preserveNewLines ? /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g : /[\u0000-\u001F\u007F]/g,
    preserveNewLines ? '' : ' ',
  );

  const normalized = preserveNewLines
    ? withoutUnsafeControls.replace(/\r\n/g, '\n')
    : withoutUnsafeControls.replace(/\s+/g, ' ');

  return normalized.slice(0, fieldLimits[key]);
}

function isValidHttpUrl(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isValidPhone(value: string) {
  return /^\+?[0-9 ()-]{7,24}$/.test(value);
}

function isValidHexColor(value: string) {
  return /^#[0-9A-Fa-f]{6}$/.test(value);
}

function normalizeHexColor(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  const withHash = trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
  return withHash.slice(0, 7).toUpperCase();
}

function buildQrValue(type: QrType, form: FormState) {
  switch (type) {
    case 'url':
      return form.url.trim();
    case 'text':
      return form.text.trim();
    case 'email': {
      const params = new URLSearchParams();
      if (form.emailSubject.trim()) {
        params.set('subject', form.emailSubject.trim());
      }
      if (form.emailBody.trim()) {
        params.set('body', form.emailBody.trim());
      }
      const query = params.toString();
      return `mailto:${form.email.trim()}${query ? `?${query}` : ''}`;
    }
    case 'phone':
      return `tel:${form.phone.trim()}`;
    case 'sms': {
      const params = new URLSearchParams();
      if (form.smsMessage.trim()) {
        params.set('body', form.smsMessage.trim());
      }
      const query = params.toString();
      return `sms:${form.smsPhone.trim()}${query ? `?${query}` : ''}`;
    }
    case 'wifi': {
      const hidden = form.wifiHidden ? 'true' : 'false';
      return `WIFI:T:${form.wifiSecurity};S:${form.wifiSsid.trim()};P:${form.wifiPassword.trim()};H:${hidden};;`;
    }
    case 'vcard': {
      const firstName = form.vcardFirstName.trim();
      const lastName = form.vcardLastName.trim();
      const fullName = `${firstName} ${lastName}`.trim();

      return [
        'BEGIN:VCARD',
        'VERSION:3.0',
        `N:${escapeVCardValue(lastName)};${escapeVCardValue(firstName)};;;`,
        `FN:${escapeVCardValue(fullName)}`,
        form.vcardOrg.trim() && `ORG:${escapeVCardValue(form.vcardOrg.trim())}`,
        form.vcardTitle.trim() &&
          `TITLE:${escapeVCardValue(form.vcardTitle.trim())}`,
        form.vcardPhone.trim() && `TEL:${escapeVCardValue(form.vcardPhone.trim())}`,
        form.vcardEmail.trim() &&
          `EMAIL:${escapeVCardValue(form.vcardEmail.trim())}`,
        form.vcardWebsite.trim() &&
          `URL:${escapeVCardValue(form.vcardWebsite.trim())}`,
        'END:VCARD',
      ]
        .filter(Boolean)
        .join('\n');
    }
  }
}

function getValidationMessage(type: QrType, form: FormState) {
  switch (type) {
    case 'url': {
      if (!form.url.trim()) {
        return 'Escribe una URL para generar este QR.';
      }

      return isValidHttpUrl(form.url.trim())
        ? ''
        : 'La URL debe empezar con http:// o https:// y ser valida.';
    }
    case 'text':
      return form.text.trim() ? '' : 'Escribe el texto que quieres guardar.';
    case 'email': {
      if (!form.email.trim()) {
        return 'Necesitamos un correo destino.';
      }

      return isValidEmail(form.email.trim())
        ? ''
        : 'El correo destino no parece valido.';
    }
    case 'phone': {
      if (!form.phone.trim()) {
        return 'Escribe un numero de telefono.';
      }

      return isValidPhone(form.phone.trim())
        ? ''
        : 'El telefono debe tener entre 7 y 24 caracteres validos.';
    }
    case 'sms': {
      if (!form.smsPhone.trim()) {
        return 'Escribe el numero que recibira el SMS.';
      }

      return isValidPhone(form.smsPhone.trim())
        ? ''
        : 'El telefono del SMS debe tener entre 7 y 24 caracteres validos.';
    }
    case 'wifi': {
      if (!form.wifiSsid.trim()) {
        return 'Escribe el nombre de la red Wi-Fi.';
      }

      if (form.wifiSecurity !== 'nopass' && !form.wifiPassword.trim()) {
        return 'Las redes protegidas necesitan una clave.';
      }

      return '';
    }
    case 'vcard': {
      const hasName =
        form.vcardFirstName.trim() || form.vcardLastName.trim();

      if (!hasName) {
        return 'Agrega al menos el nombre o apellido del contacto.';
      }

      if (form.vcardEmail.trim() && !isValidEmail(form.vcardEmail.trim())) {
        return 'El email del contacto no parece valido.';
      }

      if (form.vcardPhone.trim() && !isValidPhone(form.vcardPhone.trim())) {
        return 'El telefono del contacto no parece valido.';
      }

      if (form.vcardWebsite.trim() && !isValidHttpUrl(form.vcardWebsite.trim())) {
        return 'La web del contacto debe usar http:// o https://.';
      }

      return '';
    }
  }
}

function downloadFile(url: string, fileName: string) {
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
}

function App() {
  const [qrType, setQrType] = useState<QrType>('url');
  const [form, setForm] = useState<FormState>(initialFormState);
  const [size, setSize] = useState(320);
  const [margin, setMargin] = useState(2);
  const [darkColor, setDarkColor] = useState('#111827');
  const [lightColor, setLightColor] = useState('#ffffff');
  const [darkHexInput, setDarkHexInput] = useState('#111827');
  const [lightHexInput, setLightHexInput] = useState('#FFFFFF');
  const [errorCorrectionLevel, setErrorCorrectionLevel] =
    useState<ErrorLevel>('M');
  const [svgMarkup, setSvgMarkup] = useState('');
  const [pngUrl, setPngUrl] = useState('');
  const [isGenerating, setIsGenerating] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  const qrValue = buildQrValue(qrType, form);
  const validationMessage = getValidationMessage(qrType, form);
  const hasPreview = Boolean(svgMarkup) && !errorMessage;

  useEffect(() => {
    let isActive = true;

    async function generateQr() {
      setIsGenerating(true);
      setErrorMessage('');

      if (validationMessage) {
        setSvgMarkup('');
        setPngUrl('');
        setErrorMessage(validationMessage);
        setIsGenerating(false);
        return;
      }

      try {
        const [nextSvg, nextPng] = await Promise.all([
          QRCode.toString(qrValue, {
            type: 'svg',
            width: size,
            margin,
            color: {
              dark: darkColor,
              light: lightColor,
            },
            errorCorrectionLevel,
          }),
          QRCode.toDataURL(qrValue, {
            width: size,
            margin,
            color: {
              dark: darkColor,
              light: lightColor,
            },
            errorCorrectionLevel,
          }),
        ]);

        if (!isActive) {
          return;
        }

        setSvgMarkup(nextSvg);
        setPngUrl(nextPng);
      } catch (error) {
        if (!isActive) {
          return;
        }

        setSvgMarkup('');
        setPngUrl('');
        setErrorMessage(
          error instanceof Error
            ? error.message
            : 'No pudimos generar el QR con estos datos.',
        );
      } finally {
        if (isActive) {
          setIsGenerating(false);
        }
      }
    }

    generateQr();

    return () => {
      isActive = false;
    };
  }, [
    darkColor,
    errorCorrectionLevel,
    lightColor,
    margin,
    qrValue,
    size,
    validationMessage,
  ]);

  function updateForm<K extends keyof FormState>(key: K, nextValue: FormState[K]) {
    setForm((current) => ({
      ...current,
      [key]:
        typeof nextValue === 'string'
          ? sanitizeStringInput(key as StringFormKey, nextValue)
          : nextValue,
    }));
  }

  function downloadPng() {
    if (!pngUrl) {
      return;
    }

    downloadFile(pngUrl, `${qrType}-qr.png`);
  }

  function downloadSvg() {
    if (!svgMarkup) {
      return;
    }

    const blob = new Blob([svgMarkup], {
      type: 'image/svg+xml;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    downloadFile(url, `${qrType}-qr.svg`);
    URL.revokeObjectURL(url);
  }

  function renderCharacterHint(key: StringFormKey) {
    return (
      <small className="field-meta">
        {form[key].length}/{fieldLimits[key]} caracteres
      </small>
    );
  }

  function updateColor(type: 'dark' | 'light', value: string) {
    const normalized = normalizeHexColor(value);

    if (type === 'dark') {
      setDarkHexInput(normalized || value.toUpperCase());
      if (isValidHexColor(normalized)) {
        setDarkColor(normalized);
      }
      return;
    }

    setLightHexInput(normalized || value.toUpperCase());
    if (isValidHexColor(normalized)) {
      setLightColor(normalized);
    }
  }

  function syncColorFromPicker(type: 'dark' | 'light', value: string) {
    const normalized = value.toUpperCase();

    if (type === 'dark') {
      setDarkColor(normalized);
      setDarkHexInput(normalized);
      return;
    }

    setLightColor(normalized);
    setLightHexInput(normalized);
  }

  function renderForm() {
    switch (qrType) {
      case 'url':
        return (
          <label className="field">
            <span>URL destino</span>
            <input
              type="url"
              inputMode="url"
              maxLength={fieldLimits.url}
              value={form.url}
              onChange={(event) => updateForm('url', event.target.value)}
              placeholder="https://tu-sitio.com"
            />
            {renderCharacterHint('url')}
          </label>
        );
      case 'text':
        return (
          <label className="field">
            <span>Texto</span>
            <textarea
              rows={5}
              maxLength={fieldLimits.text}
              value={form.text}
              onChange={(event) => updateForm('text', event.target.value)}
              placeholder="Escribe el mensaje o contenido del QR"
            />
            {renderCharacterHint('text')}
          </label>
        );
      case 'email':
        return (
          <>
            <label className="field">
              <span>Correo destino</span>
              <input
                type="email"
                inputMode="email"
                maxLength={fieldLimits.email}
                value={form.email}
                onChange={(event) => updateForm('email', event.target.value)}
                placeholder="hola@tuempresa.com"
              />
              {renderCharacterHint('email')}
            </label>
            <label className="field">
              <span>Asunto</span>
              <input
                type="text"
                maxLength={fieldLimits.emailSubject}
                value={form.emailSubject}
                onChange={(event) =>
                  updateForm('emailSubject', event.target.value)
                }
                placeholder="Asunto del correo"
              />
              {renderCharacterHint('emailSubject')}
            </label>
            <label className="field">
              <span>Mensaje</span>
              <textarea
                rows={4}
                maxLength={fieldLimits.emailBody}
                value={form.emailBody}
                onChange={(event) => updateForm('emailBody', event.target.value)}
                placeholder="Mensaje inicial"
              />
              {renderCharacterHint('emailBody')}
            </label>
          </>
        );
      case 'phone':
        return (
          <label className="field">
            <span>Numero de telefono</span>
            <input
              type="tel"
              inputMode="tel"
              maxLength={fieldLimits.phone}
              value={form.phone}
              onChange={(event) => updateForm('phone', event.target.value)}
              placeholder="+18095551234"
            />
            {renderCharacterHint('phone')}
          </label>
        );
      case 'sms':
        return (
          <>
            <label className="field">
              <span>Numero de telefono</span>
              <input
                type="tel"
                inputMode="tel"
                maxLength={fieldLimits.smsPhone}
                value={form.smsPhone}
                onChange={(event) => updateForm('smsPhone', event.target.value)}
                placeholder="+18095551234"
              />
              {renderCharacterHint('smsPhone')}
            </label>
            <label className="field">
              <span>Mensaje</span>
              <textarea
                rows={4}
                maxLength={fieldLimits.smsMessage}
                value={form.smsMessage}
                onChange={(event) => updateForm('smsMessage', event.target.value)}
                placeholder="Texto que se cargara en el SMS"
              />
              {renderCharacterHint('smsMessage')}
            </label>
          </>
        );
      case 'wifi':
        return (
          <>
            <label className="field">
              <span>Nombre de la red</span>
              <input
                type="text"
                maxLength={fieldLimits.wifiSsid}
                value={form.wifiSsid}
                onChange={(event) => updateForm('wifiSsid', event.target.value)}
                placeholder="MiRedWiFi"
              />
              {renderCharacterHint('wifiSsid')}
            </label>
            <div className="grid">
              <label className="field">
                <span>Clave</span>
                <input
                  type="text"
                  maxLength={fieldLimits.wifiPassword}
                  value={form.wifiPassword}
                  onChange={(event) =>
                    updateForm('wifiPassword', event.target.value)
                  }
                  placeholder="Clave de acceso"
                  disabled={form.wifiSecurity === 'nopass'}
                />
                {renderCharacterHint('wifiPassword')}
              </label>
              <label className="field">
                <span>Seguridad</span>
                <select
                  value={form.wifiSecurity}
                  onChange={(event) =>
                    updateForm(
                      'wifiSecurity',
                      event.target.value as FormState['wifiSecurity'],
                    )
                  }
                >
                  <option value="WPA">WPA / WPA2</option>
                  <option value="WEP">WEP</option>
                  <option value="nopass">Sin clave</option>
                </select>
              </label>
            </div>
            <label className="checkbox-field">
              <input
                type="checkbox"
                checked={form.wifiHidden}
                onChange={(event) => updateForm('wifiHidden', event.target.checked)}
              />
              <span>La red esta oculta</span>
            </label>
          </>
        );
      case 'vcard':
        return (
          <>
            <div className="grid">
              <label className="field">
                <span>Nombre</span>
                <input
                  type="text"
                  maxLength={fieldLimits.vcardFirstName}
                  value={form.vcardFirstName}
                  onChange={(event) =>
                    updateForm('vcardFirstName', event.target.value)
                  }
                  placeholder="Nombre"
                />
                {renderCharacterHint('vcardFirstName')}
              </label>
              <label className="field">
                <span>Apellido</span>
                <input
                  type="text"
                  maxLength={fieldLimits.vcardLastName}
                  value={form.vcardLastName}
                  onChange={(event) =>
                    updateForm('vcardLastName', event.target.value)
                  }
                  placeholder="Apellido"
                />
                {renderCharacterHint('vcardLastName')}
              </label>
            </div>
            <div className="grid">
              <label className="field">
                <span>Empresa</span>
                <input
                  type="text"
                  maxLength={fieldLimits.vcardOrg}
                  value={form.vcardOrg}
                  onChange={(event) => updateForm('vcardOrg', event.target.value)}
                  placeholder="Empresa o marca"
                />
                {renderCharacterHint('vcardOrg')}
              </label>
              <label className="field">
                <span>Cargo</span>
                <input
                  type="text"
                  maxLength={fieldLimits.vcardTitle}
                  value={form.vcardTitle}
                  onChange={(event) => updateForm('vcardTitle', event.target.value)}
                  placeholder="Cargo"
                />
                {renderCharacterHint('vcardTitle')}
              </label>
            </div>
            <div className="grid">
              <label className="field">
                <span>Telefono</span>
                <input
                  type="tel"
                  inputMode="tel"
                  maxLength={fieldLimits.vcardPhone}
                  value={form.vcardPhone}
                  onChange={(event) => updateForm('vcardPhone', event.target.value)}
                  placeholder="+18095551234"
                />
                {renderCharacterHint('vcardPhone')}
              </label>
              <label className="field">
                <span>Email</span>
                <input
                  type="email"
                  inputMode="email"
                  maxLength={fieldLimits.vcardEmail}
                  value={form.vcardEmail}
                  onChange={(event) => updateForm('vcardEmail', event.target.value)}
                  placeholder="contacto@minegocio.com"
                />
                {renderCharacterHint('vcardEmail')}
              </label>
            </div>
            <label className="field">
              <span>Web</span>
              <input
                type="url"
                inputMode="url"
                maxLength={fieldLimits.vcardWebsite}
                value={form.vcardWebsite}
                onChange={(event) => updateForm('vcardWebsite', event.target.value)}
                placeholder="https://minegocio.com"
              />
              {renderCharacterHint('vcardWebsite')}
            </label>
          </>
        );
    }
  }

  return (
    <main className="page-shell">
      <section className="hero">
        <h1>Generador de QR</h1>
        <p className="hero-copy">
          Crea codigos QR para enlaces, texto, email, telefono, Wi-Fi y
          contactos. Ajusta el contenido, personaliza su apariencia y descarga
          el resultado en PNG o SVG.
        </p>
      </section>

      <section className="workspace">
        <div className="panel controls-panel">
          <div className="field">
            <span>Tipo de QR</span>
            <div className="type-grid">
              {qrTypeOptions.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={option.id === qrType ? 'type-card active' : 'type-card'}
                  onClick={() => setQrType(option.id)}
                >
                  <strong>{option.title}</strong>
                  <small>{option.description}</small>
                </button>
              ))}
            </div>
          </div>

          {renderForm()}

          <div className="settings-panel">
            <div className="settings-card">
              <div className="settings-card-header">
                <div>
                  <h3>Ajustes visuales</h3>
                  <p>Personaliza el aspecto del QR antes de descargarlo.</p>
                </div>
              </div>

              <div className="settings-grid">
                <label className="setting-control">
                  <div className="setting-head">
                    <span>Tamano</span>
                    <strong>{size}px</strong>
                  </div>
                  <input
                    type="range"
                    min="160"
                    max="640"
                    step="16"
                    value={size}
                    onChange={(event) => setSize(Number(event.target.value))}
                  />
                </label>

                <label className="setting-control">
                  <div className="setting-head">
                    <span>Margen</span>
                    <strong>{margin}</strong>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="8"
                    step="1"
                    value={margin}
                    onChange={(event) => setMargin(Number(event.target.value))}
                  />
                </label>
              </div>

              <div className="color-grid">
                <label className="color-card">
                  <div className="color-card-top">
                    <span>Color QR</span>
                    <strong>{darkColor.toUpperCase()}</strong>
                  </div>
                  <div className="color-card-bottom">
                    <span
                      className="color-swatch"
                      style={{ backgroundColor: darkColor }}
                    />
                    <input
                      type="color"
                      value={darkColor}
                      onChange={(event) =>
                        syncColorFromPicker('dark', event.target.value)
                      }
                    />
                  </div>
                  <div className="color-hex-row">
                    <span>HEX</span>
                    <input
                      type="text"
                      inputMode="text"
                      className="hex-input"
                      maxLength={7}
                      value={darkHexInput}
                      onChange={(event) =>
                        updateColor('dark', event.target.value)
                      }
                      placeholder="#111827"
                    />
                  </div>
                  <div className="preset-colors">
                    {['#111827', '#0F766E', '#7C2D12', '#312E81'].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        className="preset-swatch"
                        style={{ backgroundColor: preset }}
                        aria-label={`Usar color ${preset}`}
                        onClick={() => syncColorFromPicker('dark', preset)}
                      />
                    ))}
                  </div>
                </label>

                <label className="color-card">
                  <div className="color-card-top">
                    <span>Fondo</span>
                    <strong>{lightColor.toUpperCase()}</strong>
                  </div>
                  <div className="color-card-bottom">
                    <span
                      className="color-swatch"
                      style={{ backgroundColor: lightColor }}
                    />
                    <input
                      type="color"
                      value={lightColor}
                      onChange={(event) =>
                        syncColorFromPicker('light', event.target.value)
                      }
                    />
                  </div>
                  <div className="color-hex-row">
                    <span>HEX</span>
                    <input
                      type="text"
                      inputMode="text"
                      className="hex-input"
                      maxLength={7}
                      value={lightHexInput}
                      onChange={(event) =>
                        updateColor('light', event.target.value)
                      }
                      placeholder="#FFFFFF"
                    />
                  </div>
                  <div className="preset-colors">
                    {['#FFFFFF', '#F8FAFC', '#FEF3C7', '#E0F2FE'].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        className="preset-swatch"
                        style={{ backgroundColor: preset }}
                        aria-label={`Usar color ${preset}`}
                        onClick={() => syncColorFromPicker('light', preset)}
                      />
                    ))}
                  </div>
                </label>
              </div>

              <label className="field">
                <div className="field-title">
                  <span>Correccion de error</span>
                  <span className="help-wrap">
                    <button
                      type="button"
                      className="help-trigger"
                      aria-label="Explicacion sobre correccion de error"
                    >
                      ?
                    </button>
                    <span className="help-popover">
                      Define cuanta tolerancia tendra el QR si se imprime con
                      manchas, pliegues o pequenas obstrucciones. M es una buena
                      opcion general. H resiste mas, pero hace el QR un poco mas
                      denso.
                    </span>
                  </span>
                </div>
                <select
                  value={errorCorrectionLevel}
                  onChange={(event) =>
                    setErrorCorrectionLevel(event.target.value as ErrorLevel)
                  }
                >
                  <option value="L">L - menor densidad</option>
                  <option value="M">M - balanceado</option>
                  <option value="Q">Q - resistente</option>
                  <option value="H">H - maximo soporte</option>
                </select>
              </label>
            </div>
          </div>

          <div className="actions">
            <button
              type="button"
              className="primary-button"
              onClick={downloadPng}
              disabled={!pngUrl}
            >
              Descargar PNG
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={downloadSvg}
              disabled={!svgMarkup}
            >
              Descargar SVG
            </button>
          </div>
        </div>

        <div className="panel preview-panel">
          <div className="preview-header">
            <div>
              <h2>Vista previa</h2>
              <p className="preview-subtitle">
                La vista previa aparece en cuanto el contenido este listo para generar.
              </p>
            </div>
          </div>

          <div className="preview-canvas">
            {!qrValue ? (
              <div className="empty-card">
                <strong>Esperando contenido</strong>
                <p>Completa los campos para generar tu codigo QR.</p>
              </div>
            ) : errorMessage ? (
              <div className="error-card">
                <strong>No se pudo generar el QR</strong>
                <p>{errorMessage}</p>
              </div>
            ) : (
              <div
                className="svg-frame"
                dangerouslySetInnerHTML={{ __html: svgMarkup }}
              />
            )}
          </div>

          {hasPreview ? (
            <div className="preview-note">
              <span className="preview-note-dot" />
              <p>QR generado y listo para descargar.</p>
            </div>
          ) : null}

          <div className="payload-card">
            <strong>Contenido generado</strong>
            <code>{qrValue || 'Esperando contenido para generar el QR.'}</code>
          </div>

          <div className="tips">
            <p>Usa PNG para compartir rapido en web y mensajeria.</p>
            <p>Usa SVG para imprimir o escalar el QR sin perder calidad.</p>
            <p>Ajusta colores, tamano y margen para personalizar el resultado.</p>
          </div>
        </div>
      </section>
    </main>
  );
}

export default App;
