/**
 * feature-drive.js
 * Handhabt die Authentifizierung und die Dateiverwaltung in Google Drive (AppData).
 */

async function getDriveToken() {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ action: "getAuthToken" }, (response) => {
            if (chrome.runtime.lastError) {
                console.error("Message Error:", chrome.runtime.lastError);
                reject(chrome.runtime.lastError.message);
            } else if (response && response.error) {
                reject(response.error);
            } else if (response && response.token) {
                resolve(response.token);
            } else {
                reject("Unbekannter Fehler beim Abrufen des Tokens.");
            }
        });
    });
}

// ... restlicher Code (uploadArchiveToDrive, etc.) bleibt unverändert

async function uploadArchiveToDrive(archiveId, htmlContent) {
    const token = await getDriveToken();
    const metadata = {
        name: archiveId + '.html',
        parents: ['appDataFolder']
    };
    
    const boundary = '-------314159265358979323846';
    const delimiter = "\r\n--" + boundary + "\r\n";
    const closeDelim = "\r\n--" + boundary + "--";

    const multipartRequestBody =
        delimiter +
        'Content-Type: application/json\r\n\r\n' +
        JSON.stringify(metadata) +
        delimiter +
        'Content-Type: text/html\r\n\r\n' +
        htmlContent +
        closeDelim;

    const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: {
            'Authorization': 'Bearer ' + token,
            'Content-Type': 'multipart/related; boundary=' + boundary
        },
        body: multipartRequestBody
    });
    
    if (!response.ok) {
        throw new Error('Drive Upload fehlgeschlagen: ' + response.statusText);
    }
    
    const data = await response.json();
    return data.id; // Dies ist die eindeutige Google Drive File-ID
}

async function fetchArchiveFromDrive(driveFileId) {
    const token = await getDriveToken();
    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${driveFileId}?alt=media`, {
        headers: {
            'Authorization': 'Bearer ' + token
        }
    });
    
    if (!response.ok) {
        throw new Error('Drive Download fehlgeschlagen: ' + response.statusText);
    }
    
    return await response.text();
}

async function deleteArchiveFromDrive(driveFileId) {
    const token = await getDriveToken();
    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${driveFileId}`, {
        method: 'DELETE',
        headers: {
            'Authorization': 'Bearer ' + token
        }
    });
    
    if (!response.ok) {
        console.warn('Fehler beim Löschen aus Drive (möglicherweise bereits gelöscht):', response.statusText);
    }
}