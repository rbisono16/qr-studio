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

type HistoryEntry = {
  id: string;
  label: string;
  qrType: QrType;
  createdAt: string;
  qrValue: string;
  form: FormState;
  size: number;
  margin: number;
  darkColor: string;
  lightColor: string;
  errorCorrectionLevel: ErrorLevel;
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

const accessibilityTemplates = [
  {
    id: 'classic',
    name: 'Clasico',
    description: 'Maximo contraste para lectura general.',
    dark: '#111827',
    light: '#FFFFFF',
  },
  {
    id: 'soft-paper',
    name: 'Papel suave',
    description: 'Contraste alto con un fondo menos duro.',
    dark: '#0F172A',
    light: '#F8FAFC',
  },
  {
    id: 'forest',
    name: 'Bosque',
    description: 'Verde profundo, todavia muy legible.',
    dark: '#14532D',
    light: '#F0FDF4',
  },
  {
    id: 'ocean',
    name: 'Oceano',
    description: 'Azul intenso con excelente claridad.',
    dark: '#1E3A8A',
    light: '#EFF6FF',
  },
] as const;

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
const HISTORY_STORAGE_KEY = 'qr-studio-history';
const HISTORY_ENABLED_KEY = 'qr-studio-history-enabled';
const HISTORY_LIMIT = 6;

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

function hexToRgb(value: string) {
  const normalized = value.replace('#', '');
  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16),
  };
}

function channelToLinear(value: number) {
  const normalized = value / 255;
  return normalized <= 0.03928
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

function getRelativeLuminance(value: string) {
  const { r, g, b } = hexToRgb(value);
  return (
    0.2126 * channelToLinear(r) +
    0.7152 * channelToLinear(g) +
    0.0722 * channelToLinear(b)
  );
}

function getContrastRatio(dark: string, light: string) {
  const luminanceA = getRelativeLuminance(dark);
  const luminanceB = getRelativeLuminance(light);
  const lighter = Math.max(luminanceA, luminanceB);
  const darker = Math.min(luminanceA, luminanceB);
  return (lighter + 0.05) / (darker + 0.05);
}

function getAccessibilityLevel(contrastRatio: number) {
  if (contrastRatio >= 7) {
    return {
      label: 'Excelente',
      tone: 'excellent',
      helper: 'Contraste muy alto. Ideal para la mayoria de usos y entornos.',
    };
  }

  if (contrastRatio >= 4.5) {
    return {
      label: 'Muy buena',
      tone: 'good',
      helper: 'Lectura solida y recomendable para pantalla e impresion comun.',
    };
  }

  if (contrastRatio >= 3) {
    return {
      label: 'Aceptable',
      tone: 'fair',
      helper: 'Puede funcionar, pero conviene probar el escaneo en distintos dispositivos.',
    };
  }

  return {
    label: 'Baja',
    tone: 'low',
    helper: 'El contraste es flojo. Mejor subir la diferencia entre QR y fondo.',
  };
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

function getHistoryLabel(type: QrType, form: FormState) {
  switch (type) {
    case 'url':
      return form.url.trim() || 'URL';
    case 'text':
      return form.text.trim().slice(0, 42) || 'Texto';
    case 'email':
      return form.email.trim() || 'Email';
    case 'phone':
      return form.phone.trim() || 'Telefono';
    case 'sms':
      return form.smsPhone.trim() || 'SMS';
    case 'wifi':
      return form.wifiSsid.trim() || 'Wi-Fi';
    case 'vcard':
      return `${form.vcardFirstName.trim()} ${form.vcardLastName.trim()}`.trim() || 'vCard';
  }
}

function formatHistoryTimestamp(value: string) {
  try {
    return new Intl.DateTimeFormat('es', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(value));
  } catch {
    return value;
  }
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
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [historyEnabled, setHistoryEnabled] = useState(false);
  const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>([]);
  const [hasHydratedStorage, setHasHydratedStorage] = useState(false);

  const qrValue = buildQrValue(qrType, form);
  const validationMessage = getValidationMessage(qrType, form);
  const hasPreview = Boolean(svgMarkup) && !errorMessage;
  const contrastRatio = getContrastRatio(darkColor, lightColor);
  const accessibilityLevel = getAccessibilityLevel(contrastRatio);

  useEffect(() => {
    try {
      const storedEnabled = window.localStorage.getItem(HISTORY_ENABLED_KEY);
      const storedHistory = window.localStorage.getItem(HISTORY_STORAGE_KEY);

      if (storedEnabled === 'true') {
        setHistoryEnabled(true);
      }

      if (storedHistory) {
        setHistoryEntries(JSON.parse(storedHistory) as HistoryEntry[]);
      }
    } catch {
      setHistoryEntries([]);
    } finally {
      setHasHydratedStorage(true);
    }
  }, []);

  useEffect(() => {
    if (!hasHydratedStorage) {
      return;
    }

    try {
      window.localStorage.setItem(HISTORY_ENABLED_KEY, String(historyEnabled));
      if (!historyEnabled) {
        window.localStorage.removeItem(HISTORY_STORAGE_KEY);
        setHistoryEntries([]);
      }
    } catch {
      // Ignore storage issues.
    }
  }, [hasHydratedStorage, historyEnabled]);

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

  useEffect(() => {
    if (!hasHydratedStorage || !historyEnabled || !hasPreview) {
      return;
    }

    const nextEntry: HistoryEntry = {
      id: `${qrType}-${Date.now()}`,
      label: getHistoryLabel(qrType, form),
      qrType,
      createdAt: new Date().toISOString(),
      qrValue,
      form,
      size,
      margin,
      darkColor,
      lightColor,
      errorCorrectionLevel,
    };

    setHistoryEntries((current) => {
      const alreadyFirst =
        current[0]?.qrValue === nextEntry.qrValue &&
        current[0]?.qrType === nextEntry.qrType;

      if (alreadyFirst) {
        return current;
      }

      const deduped = current.filter(
        (entry) =>
          !(
            entry.qrValue === nextEntry.qrValue &&
            entry.qrType === nextEntry.qrType
          ),
      );

      const updated = [nextEntry, ...deduped].slice(0, HISTORY_LIMIT);

      try {
        window.localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(updated));
      } catch {
        // Ignore storage issues.
      }

      return updated;
    });
  }, [
    darkColor,
    errorCorrectionLevel,
    form,
    hasHydratedStorage,
    hasPreview,
    historyEnabled,
    lightColor,
    margin,
    qrType,
    qrValue,
    size,
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

  function applyAccessibilityTemplate(dark: string, light: string) {
    syncColorFromPicker('dark', dark);
    syncColorFromPicker('light', light);
  }

  function handleUrlBlur() {
    const currentUrl = form.url.trim();

    if (!currentUrl || currentUrl.startsWith('http://') || currentUrl.startsWith('https://')) {
      return;
    }

    updateForm('url', `https://${currentUrl}`);
  }

  function applyHistoryEntry(entry: HistoryEntry) {
    setQrType(entry.qrType);
    setForm(entry.form);
    setSize(entry.size);
    setMargin(entry.margin);
    setDarkColor(entry.darkColor);
    setLightColor(entry.lightColor);
    setDarkHexInput(entry.darkColor.toUpperCase());
    setLightHexInput(entry.lightColor.toUpperCase());
    setErrorCorrectionLevel(entry.errorCorrectionLevel);
    setShowAdvanced(true);
  }

  function clearHistory() {
    setHistoryEntries([]);
    try {
      window.localStorage.removeItem(HISTORY_STORAGE_KEY);
    } catch {
      // Ignore storage issues.
    }
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
              onBlur={handleUrlBlur}
              placeholder="https://tu-sitio.com"
              aria-describedby="url-help"
            />
            {renderCharacterHint('url')}
            <small id="url-help" className="helper-text">
              Si escribes `midominio.com`, la app completara `https://` automaticamente.
            </small>
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
                aria-describedby="wifi-help"
              />
              {renderCharacterHint('wifiSsid')}
              <small id="wifi-help" className="helper-text">
                Ejemplo: `Cafe Central WiFi` o `Oficina Piso 2`.
              </small>
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
                <small className="helper-text">
                  Ejemplo: `Clave2026!` o dejala vacia si la red no usa clave.
                </small>
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
        <p className="sr-only" aria-live="polite">
          {hasPreview
            ? 'QR generado y listo para descargar.'
            : errorMessage || 'Esperando contenido para generar un QR.'}
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
                  aria-pressed={option.id === qrType}
                >
                  <strong>{option.title}</strong>
                  <small>{option.description}</small>
                </button>
              ))}
            </div>
          </div>

          <div className="mode-bar">
            <div className="mode-copy">
              <strong>Modo principiante</strong>
              <p>Empieza con lo esencial y abre mas opciones solo cuando las necesites.</p>
            </div>
            <button
              type="button"
              className={showAdvanced ? 'toggle-button active' : 'toggle-button'}
              onClick={() => setShowAdvanced((current) => !current)}
              aria-expanded={showAdvanced}
              aria-controls="advanced-options"
            >
              {showAdvanced ? 'Ocultar opciones' : 'Mas opciones'}
            </button>
          </div>

          {renderForm()}

          <div
            id="advanced-options"
            className={showAdvanced ? 'settings-panel is-open' : 'settings-panel'}
          >
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

              <div className="template-card">
                <div className="template-card-header">
                  <div>
                    <h4>Plantillas accesibles</h4>
                    <p>Combinaciones preconfiguradas con buen contraste para lectura.</p>
                  </div>
                </div>
                <div className="template-grid">
                  {accessibilityTemplates.map((template) => (
                    <button
                      key={template.id}
                      type="button"
                      className="template-button"
                      onClick={() =>
                        applyAccessibilityTemplate(template.dark, template.light)
                      }
                    >
                      <span className="template-swatches">
                        <span
                          className="template-chip"
                          style={{ backgroundColor: template.dark }}
                        />
                        <span
                          className="template-chip"
                          style={{ backgroundColor: template.light }}
                        />
                      </span>
                      <strong>{template.name}</strong>
                      <small>{template.description}</small>
                    </button>
                  ))}
                </div>
              </div>

              <div className={`accessibility-card ${accessibilityLevel.tone}`}>
                <div className="accessibility-head">
                  <div>
                    <h4>Lectura y accesibilidad</h4>
                    <p>{accessibilityLevel.helper}</p>
                  </div>
                  <span className="accessibility-badge">{accessibilityLevel.label}</span>
                </div>
                <div className="accessibility-meter">
                  <div
                    className="accessibility-meter-fill"
                    style={{ width: `${Math.min((contrastRatio / 7) * 100, 100)}%` }}
                  />
                </div>
                <div className="accessibility-meta">
                  <span>Contraste</span>
                  <strong>{contrastRatio.toFixed(2)} : 1</strong>
                </div>
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
            <div className="preview-note" role="status" aria-live="polite">
              <span className="preview-note-dot" />
              <p>QR generado y listo para descargar.</p>
            </div>
          ) : null}

          <div className="actions preview-actions">
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

          <div className="payload-card">
            <strong>Contenido generado</strong>
            <code>{qrValue || 'Esperando contenido para generar el QR.'}</code>
          </div>

          <div className="history-card preview-history">
            <div className="history-header">
              <div>
                <h3>Historial local</h3>
                <p>Guarda tus ultimos QRs en este dispositivo para reutilizarlos despues.</p>
              </div>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={historyEnabled}
                  onChange={(event) => setHistoryEnabled(event.target.checked)}
                />
                <span className="switch-track" />
                <span className="sr-only">Activar historial local</span>
              </label>
            </div>

            {historyEnabled ? (
              historyEntries.length ? (
                <>
                  <div className="history-list">
                    {historyEntries.map((entry) => (
                      <button
                        key={entry.id}
                        type="button"
                        className="history-item"
                        onClick={() => applyHistoryEntry(entry)}
                      >
                        <strong>{entry.label}</strong>
                        <span>{entry.qrType.toUpperCase()}</span>
                        <small>{formatHistoryTimestamp(entry.createdAt)}</small>
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="text-button"
                    onClick={clearHistory}
                  >
                    Borrar historial
                  </button>
                </>
              ) : (
                <p className="history-empty">Todavia no hay elementos guardados.</p>
              )
            ) : (
              <p className="history-empty">
                El historial esta apagado. Activalo solo si este dispositivo es privado.
              </p>
            )}
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
