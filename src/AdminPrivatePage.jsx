import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./supabaseClient";
import "./AdminPrivatePage.css";

const ADMIN_USERNAME = "hoony6837";
const ADMIN_AUTH_EMAIL = "hoony6837@naver.com";
const PRIVATE_BUCKET = "admin-private-photos";

function createId() {
  return (
    window.crypto?.randomUUID?.() ||
    `${Date.now()}-${Math.random().toString(16).slice(2)}`
  );
}

function getExtension(file) {
  const type = file.type || "";
  if (type.includes("jpeg")) return "jpg";
  if (type.includes("png")) return "png";
  if (type.includes("webp")) return "webp";
  if (type.includes("gif")) return "gif";
  return "png";
}

function formatDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleString("ko-KR");
}

function normalizePhoto(row) {
  return {
    id: row.id,
    ownerId: row.owner_id,
    filePath: row.file_path,
    memo: row.memo || "",
    createdAt: row.created_at,
    signedUrl: "",
  };
}

export default function AdminPrivatePage() {
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState(null);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loginMessage, setLoginMessage] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);

  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const touchStartXRef = useRef(null);

  const selectedPhoto =
    photos.find((photo) => photo.id === selectedId) || null;

  const filteredPhotos = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return photos;

    return photos.filter((photo) =>
      `${photo.memo} ${formatDate(photo.createdAt)}`
        .toLowerCase()
        .includes(keyword)
    );
  }, [photos, search]);

  const loadPhotos = useCallback(async (activeSession) => {
    if (!activeSession?.user?.id) {
      setPhotos([]);
      return;
    }

    setLoading(true);
    setMessage("");

    const { data, error } = await supabase
      .from("admin_private_photos")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
      setMessage(`개인 사진을 불러오지 못했습니다: ${error.message}`);
      setLoading(false);
      return;
    }

    const normalized = (data || []).map(normalizePhoto);
    const withUrls = [];

    for (const photo of normalized) {
      const { data: signedData, error: signedError } = await supabase.storage
        .from(PRIVATE_BUCKET)
        .createSignedUrl(photo.filePath, 60 * 60);

      withUrls.push({
        ...photo,
        signedUrl: signedError ? "" : signedData.signedUrl,
      });
    }

    setPhotos(withUrls);
    setLoading(false);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const nextSession = data.session || null;
      setSession(nextSession);
      setAuthReady(true);
      if (nextSession) loadPhotos(nextSession);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession || null);
      setAuthReady(true);

      if (nextSession) {
        loadPhotos(nextSession);
      } else {
        setPhotos([]);
        setSelectedId(null);
      }
    });

    return () => subscription.unsubscribe();
  }, [loadPhotos]);

  const login = async (event) => {
    event.preventDefault();
    setLoginMessage("");

    if (username.trim() !== ADMIN_USERNAME) {
      setLoginMessage("아이디 또는 비밀번호가 올바르지 않습니다.");
      return;
    }

    setLoggingIn(true);

    const { error } = await supabase.auth.signInWithPassword({
      email: ADMIN_AUTH_EMAIL,
      password,
    });

    setLoggingIn(false);

    if (error) {
      setLoginMessage(
        "로그인에 실패했습니다. Supabase 사용자 이메일과 비밀번호를 확인하세요."
      );
      return;
    }

    setPassword("");
  };

  const logout = async () => {
    await supabase.auth.signOut();
    window.location.hash = "/";
  };

  const uploadFiles = useCallback(
    async (fileList) => {
      if (!session?.user?.id) {
        setMessage("관리자 로그인 후 업로드할 수 있습니다.");
        return;
      }

      const files = Array.from(fileList || []).filter((file) =>
        file.type.startsWith("image/")
      );

      if (!files.length) return;

      setUploading(true);
      setMessage(`${files.length}개 사진을 업로드하는 중입니다.`);

      try {
        for (const file of files) {
          const extension = getExtension(file);
          const filePath = `${session.user.id}/${Date.now()}-${createId()}.${extension}`;

          const { error: uploadError } = await supabase.storage
            .from(PRIVATE_BUCKET)
            .upload(filePath, file, {
              cacheControl: "3600",
              upsert: false,
              contentType: file.type || "image/png",
            });

          if (uploadError) throw uploadError;

          const { data: row, error: insertError } = await supabase
            .from("admin_private_photos")
            .insert({
              owner_id: session.user.id,
              file_path: filePath,
              memo: "",
            })
            .select()
            .single();

          if (insertError) {
            await supabase.storage.from(PRIVATE_BUCKET).remove([filePath]);
            throw insertError;
          }

          const { data: signedData } = await supabase.storage
            .from(PRIVATE_BUCKET)
            .createSignedUrl(filePath, 60 * 60);

          setPhotos((previous) => [
            {
              ...normalizePhoto(row),
              signedUrl: signedData?.signedUrl || "",
            },
            ...previous,
          ]);
        }

        setMessage(`${files.length}개 개인 사진을 저장했습니다.`);
      } catch (error) {
        console.error(error);
        setMessage(`업로드 실패: ${error.message}`);
      } finally {
        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
        if (cameraInputRef.current) cameraInputRef.current.value = "";
      }
    },
    [session]
  );

  useEffect(() => {
    if (!session) return undefined;

    const handlePaste = (event) => {
      const imageFiles = Array.from(event.clipboardData?.items || [])
        .filter((item) => item.type.startsWith("image/"))
        .map((item) => item.getAsFile())
        .filter(Boolean);

      if (!imageFiles.length) return;

      event.preventDefault();
      uploadFiles(imageFiles);
    };

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [session, uploadFiles]);

  const saveMemo = async (photo) => {
    const nextMemo = window.prompt("사진 메모를 입력하세요.", photo.memo);
    if (nextMemo === null) return;

    const { error } = await supabase
      .from("admin_private_photos")
      .update({ memo: nextMemo })
      .eq("id", photo.id);

    if (error) {
      setMessage(`메모 저장 실패: ${error.message}`);
      return;
    }

    setPhotos((previous) =>
      previous.map((item) =>
        item.id === photo.id ? { ...item, memo: nextMemo } : item
      )
    );

    setMessage("사진 메모를 저장했습니다.");
  };

  const deletePhoto = async (photo) => {
    const confirmed = window.confirm(
      "이 개인 사진을 완전히 삭제할까요? 삭제하면 되돌릴 수 없습니다."
    );

    if (!confirmed) return;

    const { error: deleteRowError } = await supabase
      .from("admin_private_photos")
      .delete()
      .eq("id", photo.id);

    if (deleteRowError) {
      setMessage(`삭제 실패: ${deleteRowError.message}`);
      return;
    }

    const { error: storageError } = await supabase.storage
      .from(PRIVATE_BUCKET)
      .remove([photo.filePath]);

    if (storageError) {
      console.error(storageError);
    }

    setPhotos((previous) =>
      previous.filter((item) => item.id !== photo.id)
    );
    setSelectedId(null);
    setMessage("개인 사진을 삭제했습니다.");
  };

  const movePreview = useCallback(
    (direction) => {
      if (!selectedId || !filteredPhotos.length) return;

      const index = filteredPhotos.findIndex(
        (photo) => photo.id === selectedId
      );

      if (index < 0) return;

      const nextIndex =
        (index + direction + filteredPhotos.length) % filteredPhotos.length;

      setSelectedId(filteredPhotos[nextIndex].id);
    },
    [selectedId, filteredPhotos]
  );

  useEffect(() => {
    const keydown = (event) => {
      if (event.key === "Escape") setSelectedId(null);
      if (event.key === "ArrowLeft") movePreview(-1);
      if (event.key === "ArrowRight") movePreview(1);
    };

    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [movePreview]);

  const handleTouchEnd = (event) => {
    const startX = touchStartXRef.current;
    const endX = event.changedTouches[0]?.clientX;
    touchStartXRef.current = null;

    if (typeof startX !== "number" || typeof endX !== "number") return;

    const difference = endX - startX;
    if (Math.abs(difference) < 55) return;

    movePreview(difference > 0 ? -1 : 1);
  };

  if (!authReady) {
    return <div className="admin-loading">관리자 정보를 확인하는 중입니다.</div>;
  }

  if (!session) {
    return (
      <div className="private-admin-login-page">
        <form className="private-admin-login-card" onSubmit={login}>
          <p className="admin-eyebrow">PRIVATE ADMIN</p>
          <h1>개인 사진 관리자 페이지</h1>
          <p>
            이 페이지의 사진은 일반 로또 페이지와 분리되어 저장됩니다.
          </p>

          <label>
            아이디
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              required
            />
          </label>

          <label>
            비밀번호
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
          </label>

          {loginMessage && <div className="admin-error">{loginMessage}</div>}

          <button type="submit" disabled={loggingIn}>
            {loggingIn ? "로그인 중" : "관리자 로그인"}
          </button>

          <a href="#/">일반 로또 페이지로 돌아가기</a>
        </form>
      </div>
    );
  }

  return (
    <div className="private-admin-app">
      <header className="private-admin-header">
        <div>
          <p className="admin-eyebrow">PRIVATE STORAGE</p>
          <h1>개인 사진 관리자 페이지</h1>
          <p>이곳에 올린 사진은 일반 로또 캡처 페이지에 표시되지 않습니다.</p>
        </div>

        <div className="private-admin-header-actions">
          <a href="#/">일반 페이지</a>
          <button type="button" onClick={logout}>
            로그아웃
          </button>
        </div>
      </header>

      <section className="private-admin-toolbar">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          multiple
          hidden
          onChange={(event) => uploadFiles(event.target.files)}
        />

        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={(event) => uploadFiles(event.target.files)}
        />

        <button
          type="button"
          className="private-upload-button"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
        >
          {uploading ? "업로드 중" : "개인 사진 선택"}
        </button>

        <button
          type="button"
          className="private-camera-button"
          disabled={uploading}
          onClick={() => cameraInputRef.current?.click()}
        >
          카메라 촬영
        </button>

        <label>
          사진 검색
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="메모 또는 날짜 검색"
          />
        </label>

        <div className="private-photo-count">
          <span>개인 사진</span>
          <strong>{photos.length}</strong>
        </div>
      </section>

      <section className="private-paste-guide">
        <span>{message || "캡처한 이미지는 Ctrl + V로도 저장할 수 있습니다."}</span>
      </section>

      {loading ? (
        <div className="private-empty">개인 사진을 불러오는 중입니다.</div>
      ) : filteredPhotos.length === 0 ? (
        <div className="private-empty">
          저장된 개인 사진이 없습니다. 사진 선택 또는 Ctrl + V로 추가하세요.
        </div>
      ) : (
        <main className="private-photo-grid">
          {filteredPhotos.map((photo) => (
            <article className="private-photo-card" key={photo.id}>
              <button
                type="button"
                className="private-image-button"
                onClick={() => setSelectedId(photo.id)}
              >
                {photo.signedUrl ? (
                  <img
                    src={photo.signedUrl}
                    alt="개인 저장 사진"
                    loading="lazy"
                  />
                ) : (
                  <span>이미지를 불러오지 못했습니다.</span>
                )}
              </button>

              <div className="private-photo-info">
                <span>{formatDate(photo.createdAt)}</span>
                <p>{photo.memo || "메모 없음"}</p>
              </div>

              <div className="private-photo-actions">
                <button type="button" onClick={() => saveMemo(photo)}>
                  메모 수정
                </button>
                <button
                  type="button"
                  className="private-delete-button"
                  onClick={() => deletePhoto(photo)}
                >
                  삭제
                </button>
              </div>
            </article>
          ))}
        </main>
      )}

      {selectedPhoto && (
        <div
          className="private-viewer"
          onClick={() => setSelectedId(null)}
        >
          <div
            className="private-viewer-panel"
            onClick={(event) => event.stopPropagation()}
          >
            <header>
              <div>
                <strong>개인 사진</strong>
                <span>{formatDate(selectedPhoto.createdAt)}</span>
              </div>

              <button type="button" onClick={() => setSelectedId(null)}>
                닫기
              </button>
            </header>

            <button
              type="button"
              className="private-viewer-arrow private-viewer-left"
              onClick={() => movePreview(-1)}
            >
              ‹
            </button>

            <div
              className="private-viewer-image"
              onTouchStart={(event) => {
                touchStartXRef.current =
                  event.touches[0]?.clientX ?? null;
              }}
              onTouchEnd={handleTouchEnd}
            >
              <img src={selectedPhoto.signedUrl} alt="개인 사진 확대" />
            </div>

            <button
              type="button"
              className="private-viewer-arrow private-viewer-right"
              onClick={() => movePreview(1)}
            >
              ›
            </button>

            <footer>
              <p>{selectedPhoto.memo || "메모 없음"}</p>
              <button type="button" onClick={() => saveMemo(selectedPhoto)}>
                메모 수정
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}
