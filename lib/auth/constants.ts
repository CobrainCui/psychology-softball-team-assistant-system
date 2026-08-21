/** httpOnly session cookie 名 */
export const SESSION_COOKIE_NAME = "softball_sid";

/** session 有效期（天） */
export const SESSION_TTL_DAYS = 14;

/** 密码重置 token 有效期（小时） */
export const RESET_TOKEN_TTL_HOURS = 2;

/** 入队码默认有效期（天） */
export const ENROLLMENT_CODE_TTL_DAYS = 7;

/** 用户名：3–32，字母数字下划线 */
export const USERNAME_RE = /^[a-zA-Z0-9_]{3,32}$/;

/** 入队码明文长度（不含分隔符） */
export const ENROLLMENT_CODE_LENGTH = 16;
