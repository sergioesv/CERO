'use strict';

/**
 * tests/__mocks__/supabase.js
 *
 * Mock reutilizable del cliente Supabase.
 * Expone:
 *   - mockInsert   : jest.fn() para controlar la respuesta de .insert().select().single()
 *   - mockSupabase : objeto que imita config.supabase con la cadena .from().insert().select().single()
 *
 * Uso en tests:
 *   const { mockSupabase, mockInsert } = require('../../__mocks__/supabase');
 *   jest.mock('../../../config/config', () => ({ supabase: mockSupabase, ... }));
 *   mockInsert.mockResolvedValueOnce({ error: null, data: { id: 1 } });
 */

var mockSingle = jest.fn();
var mockSelect = jest.fn(() => ({ single: mockSingle }));
var mockInsert = jest.fn(() => ({ select: mockSelect }));
var mockFrom   = jest.fn(() => ({ insert: mockInsert }));

var mockSupabase = {
  from: mockFrom
};

/**
 * Restablece todos los mocks a su estado inicial.
 * Llamar en beforeEach para aislar tests.
 */
function resetMocks() {
  mockSingle.mockReset();
  mockSelect.mockReset();
  mockInsert.mockReset();
  mockFrom.mockReset();

  // Restaurar la cadena de llamadas después del reset
  mockFrom.mockReturnValue({ insert: mockInsert });
  mockInsert.mockReturnValue({ select: mockSelect });
  mockSelect.mockReturnValue({ single: mockSingle });
}

module.exports = {
  mockSupabase,
  mockFrom,
  mockInsert,
  mockSelect,
  mockSingle,
  resetMocks
};
