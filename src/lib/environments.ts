export interface EnvVariable {
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
    key: string,
    enabled: boolean,
): Promise<void> {
    return invoke("toggle_env_variable", { workspacePath, envName, key, enabled });
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
    oldKey: string,
    newKey: string,
    newValue: string,
): Promise<EnvVariable[]> {
    return invoke<EnvVariable[]>("update_env_variable", {
        workspacePath,
        envName,
        oldKey,
        newKey,
        newValue,
    });
}

export async function deleteEnvVariable(
    workspacePath: string,
    envName: string,
    key: string,
): Promise<EnvVariable[]> {
    return invoke<EnvVariable[]>("delete_env_variable", { workspacePath, envName, key });
}
