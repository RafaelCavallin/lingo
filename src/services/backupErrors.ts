export class BackupError extends Error {}

export class BackupFileInvalid extends BackupError {
  constructor(message = 'Este arquivo não é um backup do Lingo.') {
    super(message)
  }
}

export class BackupEmpty extends BackupError {
  constructor(message = 'O arquivo não contém dados para restaurar.') {
    super(message)
  }
}

export class BackupVersionTooNew extends BackupError {
  constructor(
    message = 'Este backup foi criado por uma versão mais nova do Lingo. Atualize o app e tente de novo.',
  ) {
    super(message)
  }
}

export class BackupFormatTooOld extends BackupError {
  constructor(message = 'Este backup está em um formato antigo que o Lingo não lê mais.') {
    super(message)
  }
}
