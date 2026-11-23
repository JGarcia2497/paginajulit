import { httpsCallable } from 'firebase/functions';
import { functions } from '../config/firebase';

const normalizeError = (error) => {
  const normalized = new Error(error.message || 'Se produjo un error en el servidor. Inténtelo más tarde.');
  // Se conserva el código (p. ej. 'functions/permission-denied') para que
  // quien llama pueda distinguir un error real de una función no desplegada.
  normalized.code = error.code;
  return normalized;
};

export const functionsService = {
  call: async (functionName, data) => {
    try {
      const fn = httpsCallable(functions, functionName);
      const result = await fn(data);
      return result.data;
    } catch (error) {
      console.error(`Error en Cloud Function ${functionName}:`, error);
      throw normalizeError(error);
    }
  }
};
