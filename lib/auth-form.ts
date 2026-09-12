export type PasswordStrength = "empty" | "weak" | "medium" | "strong";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmailFormat(email: string): boolean {
  return EMAIL_RE.test(email.trim());
}

export function getPasswordChecks(password: string) {
  return {
    minLength: password.length >= 8,
    hasLetter: /[A-Za-z]/.test(password),
    hasDigit: /\d/.test(password),
    hasSpecial: /[^A-Za-z0-9]/.test(password),
  };
}

export function getPasswordStrength(password: string): PasswordStrength {
  if (!password) return "empty";
  const { minLength, hasLetter, hasDigit, hasSpecial } = getPasswordChecks(
    password,
  );
  if (!minLength || !hasLetter || !hasDigit) return "weak";
  if (hasSpecial) return "strong";
  return "medium";
}

export function friendlyAuthError(message: string): string {
  const text = message.trim();
  if (text.includes("邮箱或密码错误")) return "密码错误，请检查后重新输入";
  if (text.includes("邮箱和密码不能为空")) return "请填写邮箱和密码";
  if (text.includes("该邮箱已注册")) return "该邮箱已注册，请直接登录或更换邮箱";
  if (text.includes("密码长度")) return "密码不符合要求，请检查后重新输入";
  if (text.includes("缺少凭证")) return "登录状态异常，请稍后重试";
  if (/failed to fetch|network|load failed/i.test(text)) {
    return "网络异常，请稍后重试";
  }
  return text || "操作失败，请稍后重试";
}
