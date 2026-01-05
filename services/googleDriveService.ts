
const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest';
const SCOPES = 'https://www.googleapis.com/auth/drive.file';
const FILE_NAME = 'aura-archive-cloud-data.json';

let tokenClient: any;
let gapiInited = false;
let gisInited = false;

export const initGoogleDrive = (clientId: string): Promise<void> => {
  return new Promise((resolve) => {
    const checkInit = () => {
      if (gapiInited && gisInited) resolve();
    };

    if ((window as any).gapi) {
      (window as any).gapi.load('client', async () => {
        await (window as any).gapi.client.init({
          discoveryDocs: [DISCOVERY_DOC],
        });
        gapiInited = true;
        checkInit();
      });
    }

    if ((window as any).google) {
      tokenClient = (window as any).google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPES,
        callback: '', 
      });
      gisInited = true;
      checkInit();
    }
  });
};

export const getToken = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    tokenClient.callback = async (resp: any) => {
      if (resp.error !== undefined) {
        reject(resp);
      }
      resolve();
    };

    if ((window as any).gapi.client.getToken() === null) {
      tokenClient.requestAccessToken({ prompt: 'consent' });
    } else {
      tokenClient.requestAccessToken({ prompt: '' });
    }
  });
};

async function findFileId() {
  const response = await (window as any).gapi.client.drive.files.list({
    q: `name = '${FILE_NAME}' and trashed = false`,
    fields: 'files(id, name)',
    spaces: 'drive',
  });
  const files = response.result.files;
  return files && files.length > 0 ? files[0].id : null;
}

export const saveToDrive = async (data: any) => {
  const fileId = await findFileId();
  const metadata = {
    name: FILE_NAME,
    mimeType: 'application/json',
  };
  const content = JSON.stringify(data);
  const file = new Blob([content], { type: 'application/json' });

  if (fileId) {
    await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${(window as any).gapi.client.getToken().access_token}`,
      },
      body: file,
    });
  } else {
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', file);

    await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${(window as any).gapi.client.getToken().access_token}`,
      },
      body: form,
    });
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
  
  const data = typeof response.result === 'string' ? JSON.parse(response.result) : response.result;
  return data;
};
