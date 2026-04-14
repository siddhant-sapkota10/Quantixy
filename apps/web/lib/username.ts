export const USERNAME_STORAGE_KEY = "mathbattle-username";
export const MAX_USERNAME_LENGTH = 16;

export const sanitizeUsername = (value: string) =>
  value.replace(/\s+/g, " ").trim().slice(0, MAX_USERNAME_LENGTH);

export const isValidUsername = (value: string) => sanitizeUsername(value).length > 0;
