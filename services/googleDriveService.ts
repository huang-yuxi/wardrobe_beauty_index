
const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest';
const SCOPES = 'https://www.googleapis.com/auth/drive.file';
const FILE_NAME = 'aura-archive-cloud-data.json';

let tokenClient: any;
let gapiInited = false;
let gisInited = false;

const waitForGlobals = (key: string, maxTries = 30): Promise<any> => {
  return new Promise((resolve, reject) => {
    let tries = 0;
    const interval = setInterval(() => {
      if ((window as any)[key]) {
        clearInterval(interval);
        resolve((window as any)[key]);
      }
      if (++tries > maxTries) {
        clearInterval(interval);
        reject(new Error(`Timeout waiting for ${key}`));
      }
    }, 100);
  });
};

export const initGoogleDrive = async (clientId: string): Promise<void> => {
  if (!clientId) return;
  try {
    const gapi = await waitForGlobals('gapi');
    const google = await waitForGlobals('google');

    return new Promise((resolve) => {
      const checkInit = () => { if (gapiInited && gisInited) resolve(); };

      gapi.load('client', async () => {
        await gapi.client.init({ discoveryDocs: [DISCOVERY_DOC] });
        gapiInited = true;
        checkInit();
      });

      tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPES,
        callback: '', 
      });
      gisInited = true;
      checkInit();
    });
  } catch (err) {
    console.error("SDK Init failed:", err);
  }
};

export const signIn = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (!tokenClient) return reject("Not initialized");

    tokenClient.callback = (resp: any) => {
      if (resp.error) return reject(resp);
      // Store that we have a session
      localStorage.setItem('aura-drive-session', 'active');
      resolve();
    };

    tokenClient.requestAccessToken({ prompt: 'consent' });
  });
};

export const signOut = () => {
  const token = (window as any).gapi.client.getToken();
  if (token !== null) {
    (window as any).google.accounts.oauth2.revoke(token.access_token);
    (window as any).gapi.client.setToken(null);
  }
  localStorage.removeItem('aura-drive-session');
};

export const isSyncAvailable = () => {
  return !!(window as any).gapi?.client?.getToken();
};

async function findFileId() {
  const gapi = (window as any).gapi;
  const response = await gapi.client.drive.files.list({
    q: `name = '${FILE_NAME}' and trashed = false`,
    fields: 'files(id, name)',
    spaces: 'drive',
  });
  return response.result.files?.[0]?.id || null;
}

export const saveToDrive = async (data: any) => {
  const fileId = await findFileId();
  const token = (window as any).gapi.client.getToken()?.access_token;
  if (!token) throw new Error("No active session");

  const metadata = { name: FILE_NAME, mimeType: 'application/json' };
  const content = JSON.stringify(data);
  const file = new Blob([content], { type: 'application/json' });

  if (fileId) {
    const resp = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` },
      body: file,
    });
    if (!resp.ok) throw new Error("Update failed");
  } else {
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', file);

    const resp = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    if (!resp.ok) throw new Error("Create failed");
  }
  return Date.now();
};

export const loadFromDrive = async () => {
  const fileId = await findFileId();
  if (!fileId) return null;

  const response = await (window as any).gapi.client.drive.files.get({
    fileId: fileId,
    alt: 'media',
  });
  return typeof response.result === 'string' ? JSON.parse(response.result) : response.result;
};
