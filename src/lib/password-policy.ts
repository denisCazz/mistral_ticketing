import { z } from "zod";

export const MIN_PASSWORD_LENGTH = 12;

export const passwordSchema = z
  .string()
  .min(
    MIN_PASSWORD_LENGTH,
    `La password deve avere almeno ${MIN_PASSWORD_LENGTH} caratteri`
  );
