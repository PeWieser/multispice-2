"use client";

const KEY = "circuitlab_project";

export function saveLocal(doc: unknown) {
  try {
    localStorage.setItem(KEY, JSON.stringify(doc));
  } catch {
    // Quota exceeded
  }
}

export function loadLocal<T>(): T | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveFavorites(favs: string[]) {
  localStorage.setItem("circuitlab_favs", JSON.stringify(favs));
}

export function loadFavorites(): string[] {
  try {
    return JSON.parse(localStorage.getItem("circuitlab_favs") ?? "[]");
  } catch {
    return [];
  }
}
