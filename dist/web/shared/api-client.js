export async function apiGet(path) {
    const response = await fetch(path);
    return response.json();
}
