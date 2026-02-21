export interface EnvVariable {
    index: number;
    key: string;
    value: string;
    enabled: boolean;
}

export interface EnvFile {
    name: string;
    fileName: string;
    variables: EnvVariable[];
    isEnabled: boolean;
}

async function invoke<T>(cmd: string, args: Record<string, unknown>): Promise<T> {
    const { invoke: tauriInvoke } = await import("@tauri-apps/api/core");
    return tauriInvoke<T>(cmd, args);
}

export async function listEnvironments(workspacePath: string): Promise<EnvFile[]> {
    return invoke<EnvFile[]>("list_environments", { workspacePath });
}

export async function toggleEnvFile(
    workspacePath: string,
    envName: string,
    enabled: boolean,
): Promise<void> {
    return invoke("toggle_env_file", { workspacePath, envName, enabled });
}

export async function toggleEnvVariable(
    workspacePath: string,
    envName: string,
    index: number,
    enabled: boolean,
): Promise<void> {
    return invoke("toggle_env_variable", { workspacePath, envName, index, enabled });
}

export async function addEnvVariable(
    workspacePath: string,
    envName: string,
    key: string,
    value: string,
): Promise<EnvVariable[]> {
    return invoke<EnvVariable[]>("add_env_variable", { workspacePath, envName, key, value });
}

export async function updateEnvVariable(
    workspacePath: string,
    envName: string,
    index: number,
    newKey: string,
    newValue: string,
): Promise<EnvVariable[]> {
    return invoke<EnvVariable[]>("update_env_variable", {
        workspacePath,
        envName,
        index,
        newKey,
        newValue,
    });
}

export async function deleteEnvVariable(
    workspacePath: string,
    envName: string,
    index: number,
): Promise<EnvVariable[]> {
    return invoke<EnvVariable[]>("delete_env_variable", { workspacePath, envName, index });
}

export async function createEnvFile(
    workspacePath: string,
    envName: string,
): Promise<void> {
    return invoke("create_env_file", { workspacePath, envName });
}

export async function renameEnvFile(
    workspacePath: string,
    oldName: string,
    newName: string,
): Promise<void> {
    return invoke("rename_env_file", { workspacePath, oldName, newName });
}

export async function deleteEnvFile(
    workspacePath: string,
    envName: string,
): Promise<void> {
    return invoke("delete_env_file", { workspacePath, envName });
}
