/**
 * camera.js — 웹캠 접근과 오류 안내
 */

/** 카메라를 켜고 video 요소에 연결한다. 성공 시 MediaStream 반환. */
export async function startCamera(video) {
  if (!window.isSecureContext) {
    throw new Error('카메라는 HTTPS 주소(또는 localhost)에서만 사용할 수 있습니다.');
  }
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error('이 브라우저는 카메라 접근을 지원하지 않습니다. 최신 Chrome 또는 Edge를 사용해 주세요.');
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: 'user',
      width: { ideal: 1280 },
      height: { ideal: 720 },
    },
    audio: false,
  });

  video.srcObject = stream;
  try {
    await video.play();

    // 첫 프레임이 준비될 때까지 대기 (최대 8초)
    if (video.readyState < 2) {
      await Promise.race([
        new Promise((resolve) => video.addEventListener('loadeddata', resolve, { once: true })),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('카메라 영상이 들어오지 않습니다. 다른 프로그램이 카메라를 쓰고 있는지 확인해 주세요.')), 8000)
        ),
      ]);
    }
  } catch (e) {
    stream.getTracks().forEach((t) => t.stop()); // 실패 시 카메라 해제
    throw e;
  }
  return stream;
}

/** getUserMedia 오류를 사용자용 문장으로 바꾼다. */
export function explainCameraError(err) {
  switch (err && err.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return '카메라 권한이 거부되었습니다. 주소창 왼쪽의 카메라 아이콘에서 허용으로 바꾼 뒤 다시 시도해 주세요.';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return '사용할 수 있는 카메라를 찾지 못했습니다. 카메라 연결을 확인해 주세요.';
    case 'NotReadableError':
    case 'AbortError':
      return '카메라를 열 수 없습니다. 다른 프로그램이 카메라를 사용 중인지 확인해 주세요.';
    default:
      return (err && err.message) || '카메라를 시작하지 못했습니다.';
  }
}
