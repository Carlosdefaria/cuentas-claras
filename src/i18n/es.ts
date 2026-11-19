// Textos de la interfaz (español). Centralizados para poder traducir más adelante.
// Voz: tú, cercana y clara (ver PRODUCT.md).

export const es = {
  appName: 'Cuentas Claras',
  common: {
    back: 'Volver',
    retry: 'Reintentar',
    loading: 'Cargando…',
    skipToContent: 'Saltar al contenido',
  },
  auth: {
    signIn: {
      title: 'Entra en tu cuenta',
      submit: 'Entrar',
      submitting: 'Entrando…',
      noAccount: '¿Aún no tienes cuenta?',
      toSignUp: 'Crear cuenta',
      redirected: 'Entra para continuar.',
    },
    signUp: {
      title: 'Crea tu cuenta',
      submit: 'Crear cuenta',
      submitting: 'Creando cuenta…',
      hasAccount: '¿Ya tienes cuenta?',
      toSignIn: 'Entrar',
    },
    fields: {
      name: 'Nombre',
      nameHint: 'Así te verán en tus grupos.',
      email: 'Email',
      password: 'Contraseña',
      passwordHint: 'Mínimo 8 caracteres.',
      showPassword: 'Mostrar contraseña',
      hidePassword: 'Ocultar contraseña',
    },
    validation: {
      nameRequired: 'Escribe tu nombre.',
      emailRequired: 'Escribe tu email.',
      emailInvalid: 'Ese email no parece válido.',
      passwordRequired: 'Escribe tu contraseña.',
      passwordTooShort: 'La contraseña debe tener al menos 8 caracteres.',
    },
    errors: {
      invalidCredentials: 'Email o contraseña incorrectos.',
      userExists: 'Ya hay una cuenta con ese email. Prueba a entrar.',
      passwordTooShort: 'La contraseña debe tener al menos 8 caracteres.',
      passwordTooLong: 'La contraseña es demasiado larga.',
      invalidEmail: 'Ese email no parece válido.',
      tooManyRequests: 'Demasiados intentos. Espera un minuto y vuelve a probar.',
      network: 'No hay conexión. Revisa tu internet y vuelve a probar.',
      unavailable: 'El servicio no responde ahora mismo. Vuelve a probar en un momento.',
      generic: 'Algo ha fallado. Vuelve a probar.',
    },
    session: {
      checking: 'Comprobando tu sesión…',
      errorTitle: 'No hemos podido comprobar tu sesión',
    },
  },
  nav: {
    groups: 'Grupos',
    account: 'Cuenta',
  },
  groups: {
    title: 'Grupos',
    emptyTitle: 'Todavía no tienes grupos',
    emptyBody: 'Crea un grupo para un viaje, el piso o una cena y comparte el enlace con los demás.',
    emptyCta: 'Crear grupo',
    comingSoon: 'Muy pronto podrás crear grupos aquí.',
  },
  account: {
    title: 'Cuenta',
    signedInAs: 'Has entrado como',
    signOut: 'Cerrar sesión',
    signingOut: 'Cerrando sesión…',
  },
} as const
