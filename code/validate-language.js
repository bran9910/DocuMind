const userResponse = $input.first().json.message?.text?.toUpperCase().trim();

// Nettoyer la réponse (enlever espaces, accents si nécessaire)
const cleanResponse = userResponse.replace(/\s/g, '');

if (cleanResponse === 'FR' || cleanResponse === 'F') {
  return [{
    json: {
      language: 'FR',
      valid: true,
      chat_id: $input.first().json.message.chat.id,
      message_id: $input.first().json.message.message_id
    }
  }];
} else if (cleanResponse === 'ENG' || cleanResponse === 'EN' || cleanResponse === 'E') {
  return [{
    json: {
      language: 'ENG',
      valid: true,
      chat_id: $input.first().json.message.chat.id,
      message_id: $input.first().json.message.message_id
    }
  }];
} else {
  return [{
    json: {
      language: null,
      valid: false,
      chat_id: $input.first().json.message.chat.id,
      message_id: $input.first().json.message.message_id,
      original_response: userResponse
    }
  }];
}
