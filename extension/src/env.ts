import * as vscode from 'vscode';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

export function getBackendUrl(): string {
    return process.env.BACKEND_TELEMETRY_URL || 
           vscode.workspace.getConfiguration('mycpc').get<string>('backendUrl') || 
           'http://localhost:3002'; // Default fallback, but primarily driven by env now
}

export function getListenerPort(): number {
    return parseInt(process.env.LOCAL_LISTENER_PORT || '10043', 10);
}
