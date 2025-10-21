import React, { useState, useEffect } from 'react';

const Login = ({ onLogin }) => {
  const [username, setUsername] = useState('admin'); // 기본값만 admin으로 설정
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [capsLockWarning, setCapsLockWarning] = useState(false);

  // 사용자 계정 정보 (실제 운영에서는 서버에서 관리해야 함)
  const userAccounts = {
    'admin': 'sammi1234',
    'member': '1234'
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    // localStorage에서 저장된 비밀번호 확인 (없으면 기본값 사용)
    let validPassword = userAccounts[username];
    
    // 비밀번호가 변경된 경우 localStorage에서 확인
    const storedPassword = localStorage.getItem(`${username}_password`);
    if (storedPassword) {
      validPassword = storedPassword;
    }
    
    if (validPassword && password === validPassword) {
      // 로그인 성공 시 사용자 정보와 함께 전달
      onLogin(true, { username, role: username === 'admin' ? 'admin' : 'member' });
    } else {
      setError('아이디 또는 비밀번호가 올바르지 않습니다.');
    }
  };

  // 캡스락 감지 함수
  const handlePasswordKeyPress = (e) => {
    const char = e.key;
    const isUpperCase = char >= 'A' && char <= 'Z';
    const isLowerCase = char >= 'a' && char <= 'z';
    
    if (isUpperCase && !e.shiftKey) {
      setCapsLockWarning(true);
    } else if (isLowerCase && e.shiftKey) {
      setCapsLockWarning(true);
    } else if (isLowerCase || isUpperCase) {
      setCapsLockWarning(false);
    }
  };

  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword);
  };

  return (
    <div className="login-container">
      <form onSubmit={handleSubmit} className="login-form">
        <h2>로그인</h2>
        {error && <p className="error-message">{error}</p>}
        {capsLockWarning && <p className="caps-lock-warning">⚠️ 대소문자를 구분합니다. Caps Lock이 켜져 있는지 확인하세요.</p>}
        
        <div className="form-group">
          <label htmlFor="username">아이디:</label>
          <input
            type="text"
            id="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="아이디를 입력하세요"
            required
          />
        </div>
        
        <div className="form-group">
          <label htmlFor="password">비밀번호:</label>
          <div className="password-input-container">
            <input
              type={showPassword ? "text" : "password"}
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyPress={handlePasswordKeyPress}
              required
            />
            <button
              type="button"
              className="password-toggle-btn"
              onClick={togglePasswordVisibility}
              aria-label={showPassword ? "비밀번호 숨기기" : "비밀번호 보기"}
            >
              {showPassword ? "👁️" : "👁️‍🗨️"}
            </button>
          </div>
        </div>
        
        <button type="submit" className="login-button">로그인</button>
      </form>
    </div>
  );
};

export default Login;
