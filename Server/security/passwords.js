// A deliberately small, local denylist for the most frequently reused passwords.
// It keeps registration fail-closed without sending a proposed password to a third
// party. Expand this set from a reviewed breach corpus during regular maintenance;
// never log or persist the rejected value.
const COMMON_PASSWORDS = new Set([
    '123456789012345',
    '1234567890123456',
    '111111111111111',
    'passwordpassword',
    'password123456',
    'password123456789',
    'qwertyuiopasdfgh',
    'qwerty123456789',
    'letmeinletmein',
    'administrator',
    'administrator123',
    'iloveyouiloveyou',
    'welcome123456789',
    'changemechangeme',
    'correcthorsebatterystaple',
    'thisisapassword',
    'mysecretpassword',
    'footballfootball',
    'baseballbaseball',
    'sunshinesunshine',
    'princessprincess',
    'dragonballz12345',
    'trustno1trustno1',
    'abc123abc123abc',
    'qwertyqwertyqwerty'
]);

function isCommonPassword(password) {
    return COMMON_PASSWORDS.has(String(password).toLowerCase());
}

module.exports = { isCommonPassword };
