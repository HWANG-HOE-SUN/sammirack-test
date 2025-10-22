// src/components/Login.jsx
import React, { useState } from 'react';
import { adminSyncManager } from '../utils/realtimeAdminSync';

const Login = ({ onLogin }) => {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [capsLockWarning, setCapsLockWarning] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const userAccounts = {
    'admin': 'sammi1234',
    'member': '1234'
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoggingIn(true);
    setError('');
    
    try {
      // 비밀번호 검증
      let validPassword = userAccounts[username];
      const storedPassword = localStorage.getItem(`${username}_password`);
      if (storedPassword) {
        validPassword = storedPassword;
      }
      
      if (!validPassword || password !== validPassword) {
        setError('아이디 또는 비밀번호가 올바르지 않습니다.');
        return;
      }

      // IP 정보 수집
      const ipInfo = await collectIPInfo();
      
      const userInfo = {
        username,
        role: username === 'admin' ? 'admin' : 'member',
        loginTime: new Date().toISOString(),
        ip: ipInfo.ip,
        location: ipInfo.location,
        userAgent: navigator.userAgent,
        sessionId: generateSessionId()
      };

      // 관리자 로그인 활동 기록 및 브로드캐스트
      if (username === 'admin') {
        await logAdminActivity('LOGIN', userInfo);
        
        // 다른 PC/탭에 관리자 로그인 알림
        if (adminSyncManager.syncChannel) {
          adminSyncManager.syncChannel.postMessage({
            type: 'ADMIN_LOGIN',
            data: userInfo,
            timestamp: Date.now()
          });
        }
      }

      // 로그인 성공
      onLogin(true, userInfo);
      
    } catch (error) {
      console.error('로그인 처리 실패:', error);
      setError('로그인 처리 중 오류가 발생했습니다.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  // IP 정보 수집
  const collectIPInfo = async () => {
    try {
      // 캐시 확인
      const cachedInfo = localStorage.getItem('current_ip_info');
      if (cachedInfo) {
        const { ip, location, timestamp } = JSON.parse(cachedInfo);
        if (Date.now() - timestamp < 3600000) { // 1시간 캐시
          return { ip, location };
        }
      }

      // 여러 IP 서비스 시도
      const ipServices = [
        {
          url: 'https://api.ipify.org?format=json',
          parser: (data) => ({ ip: data.ip, location: 'Unknown' })
        },
        {
          url: 'https://ipapi.co/json/',
          parser: (data) => ({
            ip: data.ip,
            location: [data.city, data.region, data.country].filter(Boolean).join(', ')
          })
        },
        {
          url: 'https://ipinfo.io/json',
          parser: (data) => ({
            ip: data.ip,
            location: [data.city, data.region, data.country].filter(Boolean).join(', ')
          })
        }
      ];

      for (const service of ipServices) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 5000); // 5초 타임아웃

          const response = await fetch(service.url, {
            signal: controller.signal
          });
          clearTimeout(timeoutId);

          if (response.ok) {
            const data = await response.json();
            const ipInfo = service.parser(data);
            
            // 캐시 저장
            localStorage.setItem('current_ip_info', JSON.stringify({
              ...ipInfo,
              timestamp: Date.now()
            }));
            
            return ipInfo;
          }
        } catch (error) {
          console.warn(`IP 서비스 실패: ${service.url}`, error.message);
          continue;
        }
      }

      // 모든 서비스 실패 시 기본값
      return {
        ip: 'Unknown',
        location: 'Unknown'
      };

    } catch (error) {
      console.error('IP 정보 수집 실패:', error);
      return {
        ip: 'Error',
        location: 'Error'
      };
    }
  };

  // 관리자 활동 로그 기록
  const logAdminActivity = async (action, details) => {
    try {
      const logs = JSON.parse(localStorage.getItem('admin_activity_log') || '[]');
      
      const newLog = {
        id: Date.now(),
        action,
        timestamp: new Date().toISOString(),
        username: details.username,
        ip: details.ip,
        location: details.location,
        userAgent: details.userAgent,
        sessionId: details.sessionId,
        details
      };

      logs.unshift(newLog);
      
      // 최대 1000개 로그 유지
      if (logs.length > 1000) {
        logs.splice(1000);
      }

      localStorage.setItem('admin_activity_log', JSON.stringify(logs));
      
      console.log(`✅ 관리자 활동 기록: ${action}`, newLog);
      
    } catch (error) {
      console.error('활동 로그 기록 실패:', error);
    }
  };

  // 세션 ID 생성
  const generateSessionId = () => {
    return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  };

  // 캡스락 감지
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
      <div className="login-form-wrapper">
        <div className="login-header">
          <h1>(주)삼미앵글</h1>
          <h2>관리 시스템</h2>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          {error && (
            <div className="error-message">
              ⚠️ {error}
            </div>
          )}
          
          {capsLockWarning && (
            <div className="caps-lock-warning">
              ⚠️ 대소문자를 구분합니다. Caps Lock이 켜져 있는지 확인하세요.
            </div>
          )}
          
          <div className="form-group">
            <label htmlFor="username">아이디</label>
            <input
              type="text"
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="아이디를 입력하세요"
              required
              disabled={isLoggingIn}
            />
          </div>
          
          <div className="form-group">
            <label htmlFor="password">비밀번호</label>
            <div className="password-input-container">
              <input
                type={showPassword ? "text" : "password"}
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyPress={handlePasswordKeyPress}
                placeholder="비밀번호를 입력하세요"
                required
                disabled={isLoggingIn}
              />
              <button
                type="button"
                className="password-toggle-btn"
                onClick={togglePasswordVisibility}
                disabled={isLoggingIn}
                aria-label={showPassword ? "비밀번호 숨기기" : "비밀번호 보기"}
              >
                {showPassword ? '🙈' : '👁️'}
              </button>
            </div>
          </div>
          
          <button 
            type="submit" 
            className="login-btn"
            disabled={isLoggingIn || !username || !password}
          >
            {isLoggingIn ? '로그인 중...' : '로그인'}
          </button>
        </form>

        <div className="login-footer">
          <div className="security-info">
            🔒 모든 로그인 활동이 IP 주소와 함께 기록됩니다.
          </div>
          <div className="sync-info">
            🌐 관리자 설정 변경 시 모든 PC에 실시간 동기화됩니다.
          </div>
        </div>
      </div>

      <style jsx>{`
        .login-container {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          padding: 20px;
        }

        .login-form-wrapper {
          background: white;
          border-radius: 12px;
          padding: 40px;
          width: 100%;
          max-width: 400px;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
        }

        .login-header {
          text-align: center;
          margin-bottom: 30px;
        }

        .login-header h1 {
          margin: 0 0 10px 0;
          color: #333;
          font-size: 24px;
          font-weight: bold;
        }

        .login-header h2 {
          margin: 0;
          color: #666;
          font-size: 16px;
          font-weight: normal;
        }

        .login-form {
          display: flex;
          flex-direction: column;
        }

        .error-message {
          background: #f8d7da;
          color: #721c24;
          padding: 12px;
          border-radius: 6px;
          margin-bottom: 20px;
          border: 1px solid #f5c6cb;
          font-size: 14px;
        }

        .caps-lock-warning {
          background: #fff3cd;
          color: #856404;
          padding: 12px;
          border-radius: 6px;
          margin-bottom: 20px;
          border: 1px solid #ffeaa7;
          font-size: 14px;
        }

        .form-group {
          margin-bottom: 20px;
        }

        .form-group label {
          display: block;
          margin-bottom: 8px;
          font-weight: bold;
          color: #333;
        }

        .form-group input {
          width: 100%;
          padding: 12px;
          border: 1px solid #ddd;
          border-radius: 6px;
          font-size: 16px;
          box-sizing: border-box;
          transition: border-color 0.2s, box-shadow 0.2s;
        }

        .form-group input:focus {
          border-color: #007bff;
          outline: none;
          box-shadow: 0 0 0 3px rgba(0, 123, 255, 0.1);
        }

        .form-group input:disabled {
          background: #f8f9fa;
          color: #6c757d;
        }

        .password-input-container {
          position: relative;
        }

        .password-toggle-btn {
          position: absolute;
          right: 12px;
          top: 50%;
          transform: translateY(-50%);
          background: none;
          border: none;
          cursor: pointer;
          padding: 4px;
          font-size: 16px;
        }

        .password-toggle-btn:disabled {
          cursor: not-allowed;
          opacity: 0.5;
        }

        .login-btn {
          background: #007bff;
          color: white;
          border: none;
          padding: 14px;
          border-radius: 6px;
          font-size: 16px;
          font-weight: bold;
          cursor: pointer;
          transition: background-color 0.2s;
          margin-top: 10px;
        }

        .login-btn:hover:not(:disabled) {
          background: #0056b3;
        }

        .login-btn:disabled {
          background: #6c757d;
          cursor: not-allowed;
        }

        .login-footer {
          margin-top: 30px;
          text-align: center;
        }

        .security-info {
          background: #f8f9fa;
          color: #495057;
          padding: 10px;
          border-radius: 6px;
          font-size: 12px;
          margin-bottom: 10px;
        }

        .sync-info {
          background: #e3f2fd;
          color: #1565c0;
          padding: 10px;
          border-radius: 6px;
          font-size: 12px;
          font-weight: bold;
        }
      `}</style>
    </div>
  );
};

export default Login;
