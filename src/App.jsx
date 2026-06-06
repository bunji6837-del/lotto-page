import { useCallback, useEffect, useRef, useState } from "react";
import { LOTTO_BUCKET, supabase } from "./supabaseClient";
import "./App.css";

function createId() {
  if (window.crypto && window.crypto.randomUUID) {
    return window.crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getFileExtension(file) {
  const type = file.type || "";

  if (type.includes("jpeg")) return "jpg";
  if (type.includes("png")) return "png";
  if (type.includes("webp")) return "webp";
  if (type.includes("gif")) return "gif";

  return "png";
}

function makeImagePath(round, file) {
  const safeRound = String(round || "미지정").replace(/[^\w가-힣-]/g, "_");
  const extension = getFileExtension(file);

  return `${safeRound}/${Date.now()}-${createId()}.${extension}`;
}

function formatDate(value) {
  if (!value) return "";

  return new Date(value).toLocaleString("ko-KR");
}

function isMobileScreen() {
  return window.matchMedia("(max-width: 768px)").matches;
}

async function removeStorageFiles(paths) {
  const validPaths = paths.filter(Boolean);

  if (validPaths.length === 0) return;

  const chunkSize = 100;

  for (let i = 0; i < validPaths.length; i += chunkSize) {
    const chunk = validPaths.slice(i, i + chunkSize);

    const { error } = await supabase.storage.from(LOTTO_BUCKET).remove(chunk);

    if (error) {
      throw error;
    }
  }
}

export default function App() {
  const [round, setRound] = useState("");
  const [searchRound, setSearchRound] = useState("");
  const [captures, setCaptures] = useState([]);
  const [message, setMessage] = useState(
    "회차를 입력하고 캡처 이미지를 Ctrl + V로 붙여넣으세요."
  );
  const [isLoading, setIsLoading] = useState(true);
  const [selectedCaptureId, setSelectedCaptureId] = useState(null);
  const [previewCaptureId, setPreviewCaptureId] = useState(null);
  const [boardMode, setBoardMode] = useState("locked");

  const [isMemoOpen, setIsMemoOpen] = useState(false);
  const [pageMemo, setPageMemo] = useState("");
  const [lastSavedMemo, setLastSavedMemo] = useState("");
  const [memoSaveStatus, setMemoSaveStatus] = useState("idle");
  const [isMemoLoaded, setIsMemoLoaded] = useState(false);
  const [memoUpdatedAt, setMemoUpdatedAt] = useState("");

  const [toasts, setToasts] = useState([]);
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [isConfirming, setIsConfirming] = useState(false);

  const capturesRef = useRef([]);
  const dragRef = useRef(null);

  const previewCapture =
    captures.find((capture) => capture.id === previewCaptureId) || null;

  const showToast = useCallback((text, type = "info") => {
    if (isMobileScreen()) {
      return;
    }

    const id = createId();

    setToasts((prev) => {
      const next = [...prev, { id, text, type }];
      return next.slice(-4);
    });

    window.setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, 3200);
  }, []);

  const handleToggleBoardMode = () => {
    const next = boardMode === "editing" ? "locked" : "editing";

    setBoardMode(next);

    if (next === "editing") {
      setMessage("수정 상태입니다. 카드 상단을 잡고 위치를 이동할 수 있습니다.");
      showToast("수정 상태로 변경되었습니다.", "info");
    } else {
      dragRef.current = null;
      setMessage("저장 상태입니다. 카드 위치 이동이 잠겼습니다.");
      showToast("저장 상태로 변경되었습니다.", "success");
    }
  };

  useEffect(() => {
    capturesRef.current = captures;
  }, [captures]);

  const loadCaptures = useCallback(async () => {
    try {
      setIsLoading(true);

      const { data, error } = await supabase
        .from("lotto_captures")
        .select("*")
        .order("z_index", { ascending: true })
        .order("created_at", { ascending: true });

      if (error) {
        throw error;
      }

      const formatted = (data || []).map((item) => ({
        id: item.id,
        round: item.round,
        imagePath: item.image_path,
        imageUrl: item.image_url,
        x: item.x,
        y: item.y,
        zIndex: item.z_index,
        createdAt: item.created_at,
      }));

      setCaptures(formatted);

      setSelectedCaptureId((prev) => {
        if (prev && formatted.some((item) => item.id === prev)) {
          return prev;
        }

        return formatted[0]?.id || null;
      });

      setMessage("Supabase에서 데이터를 불러왔습니다.");
    } catch (error) {
      console.error(error);
      setMessage("Supabase 데이터를 불러오지 못했습니다.");
      showToast("Supabase 데이터를 불러오지 못했습니다.", "error");
    } finally {
      setIsLoading(false);
    }
  }, [showToast]);

  const loadPageMemo = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("lotto_page_notes")
        .select("*")
        .eq("id", "main")
        .maybeSingle();

      if (error) {
        throw error;
      }

      const content = data?.content || "";

      setPageMemo(content);
      setLastSavedMemo(content);
      setMemoUpdatedAt(data?.updated_at || "");
      setMemoSaveStatus("idle");
      setIsMemoLoaded(true);
    } catch (error) {
      console.error(error);
      setIsMemoLoaded(true);
      setMemoSaveStatus("error");
      showToast("메모장을 불러오지 못했습니다.", "error");
    }
  }, [showToast]);

  useEffect(() => {
    loadCaptures();
    loadPageMemo();
  }, [loadCaptures, loadPageMemo]);

  useEffect(() => {
    if (!isMemoLoaded) return;

    if (pageMemo === lastSavedMemo) {
      return;
    }

    setMemoSaveStatus("saving");

    const timer = window.setTimeout(async () => {
      try {
        const now = new Date().toISOString();

        const { error } = await supabase.from("lotto_page_notes").upsert(
          {
            id: "main",
            content: pageMemo,
            updated_at: now,
          },
          {
            onConflict: "id",
          }
        );

        if (error) {
          throw error;
        }

        setLastSavedMemo(pageMemo);
        setMemoUpdatedAt(now);
        setMemoSaveStatus("saved");
      } catch (error) {
        console.error(error);
        setMemoSaveStatus("error");
        showToast("메모 저장 중 오류가 발생했습니다.", "error");
      }
    }, 800);

    return () => {
      window.clearTimeout(timer);
    };
  }, [pageMemo, lastSavedMemo, isMemoLoaded, showToast]);

  const addImageCapture = useCallback(
    async (file) => {
      const safeRound = round.trim() || "미지정";
      const count = capturesRef.current.length;
      const maxZIndex = capturesRef.current.reduce((max, item) => {
        return Math.max(max, item.zIndex || 1);
      }, 1);

      const imagePath = makeImagePath(safeRound, file);

      const { error: uploadError } = await supabase.storage
        .from(LOTTO_BUCKET)
        .upload(imagePath, file, {
          cacheControl: "3600",
          upsert: false,
          contentType: file.type || "image/png",
        });

      if (uploadError) {
        throw uploadError;
      }

      const { data: publicUrlData } = supabase.storage
        .from(LOTTO_BUCKET)
        .getPublicUrl(imagePath);

      const imageUrl = publicUrlData.publicUrl;

      const newCapture = {
        round: safeRound,
        image_path: imagePath,
        image_url: imageUrl,
        x: 24 + (count % 5) * 34,
        y: 24 + (count % 5) * 34,
        z_index: maxZIndex + 1,
      };

      const { data, error: insertError } = await supabase
        .from("lotto_captures")
        .insert(newCapture)
        .select()
        .single();

      if (insertError) {
        await supabase.storage.from(LOTTO_BUCKET).remove([imagePath]);
        throw insertError;
      }

      const formatted = {
        id: data.id,
        round: data.round,
        imagePath: data.image_path,
        imageUrl: data.image_url,
        x: data.x,
        y: data.y,
        zIndex: data.z_index,
        createdAt: data.created_at,
      };

      setCaptures((prev) => [...prev, formatted]);
      setSelectedCaptureId(formatted.id);
      setMessage(`${safeRound}회차 캡처가 Supabase에 저장되었습니다.`);
      showToast(`${safeRound}회차 캡처가 저장되었습니다.`, "success");
    },
    [round, showToast]
  );

  const handlePaste = useCallback(
    async (event) => {
      const items = event.clipboardData?.items;

      if (!items || items.length === 0) return;

      const imageItems = Array.from(items).filter((item) => {
        return item.type.startsWith("image/");
      });

      if (imageItems.length === 0) return;

      event.preventDefault();

      try {
        for (const item of imageItems) {
          const file = item.getAsFile();

          if (file) {
            await addImageCapture(file);
          }
        }
      } catch (error) {
        console.error(error);
        setMessage("이미지를 Supabase에 저장하는 중 오류가 발생했습니다.");
        showToast("이미지를 저장하지 못했습니다.", "error");
      }
    },
    [addImageCapture, showToast]
  );

  useEffect(() => {
    window.addEventListener("paste", handlePaste);

    return () => {
      window.removeEventListener("paste", handlePaste);
    };
  }, [handlePaste]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setPreviewCaptureId(null);
        setConfirmDialog(null);
        setIsMemoOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  useEffect(() => {
    const handlePointerMove = (event) => {
      if (!dragRef.current) return;

      const { id, startX, startY, originalX, originalY } = dragRef.current;

      const nextX = Math.max(0, originalX + event.clientX - startX);
      const nextY = Math.max(0, originalY + event.clientY - startY);

      setCaptures((prev) =>
        prev.map((capture) =>
          capture.id === id
            ? {
                ...capture,
                x: nextX,
                y: nextY,
              }
            : capture
        )
      );
    };

    const handlePointerUp = async () => {
      if (!dragRef.current) return;

      const { id, zIndex } = dragRef.current;
      dragRef.current = null;

      const latest = capturesRef.current.find((capture) => capture.id === id);

      if (!latest) return;

      try {
        const { error } = await supabase
          .from("lotto_captures")
          .update({
            x: latest.x,
            y: latest.y,
            z_index: zIndex,
          })
          .eq("id", id);

        if (error) {
          throw error;
        }

        setMessage("위치가 Supabase에 저장되었습니다.");
        showToast("위치가 저장되었습니다.", "success");
      } catch (error) {
        console.error(error);
        setMessage("위치 저장 중 오류가 발생했습니다.");
        showToast("위치를 저장하지 못했습니다.", "error");
      }
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [showToast]);

  const startDrag = (event, capture) => {
    if (event.button !== 0) return;

    setSelectedCaptureId(capture.id);

    if (boardMode !== "editing") {
      showToast("수정 상태에서만 위치를 이동할 수 있습니다.", "info");
      setMessage("저장 상태에서는 카드 위치 이동이 잠겨 있습니다.");
      return;
    }

    const maxZIndex = capturesRef.current.reduce((max, item) => {
      return Math.max(max, item.zIndex || 1);
    }, 1);

    const nextZIndex = maxZIndex + 1;

    dragRef.current = {
      id: capture.id,
      startX: event.clientX,
      startY: event.clientY,
      originalX: capture.x,
      originalY: capture.y,
      zIndex: nextZIndex,
    };

    setCaptures((prev) =>
      prev.map((item) =>
        item.id === capture.id
          ? {
              ...item,
              zIndex: nextZIndex,
            }
          : item
      )
    );
  };

  const openDeleteConfirm = (capture) => {
    setConfirmDialog({
      title: "캡처를 삭제할까요?",
      description: `${capture.round}회차 캡처가 삭제됩니다. 웹페이지 메모장은 삭제되지 않습니다.`,
      confirmText: "삭제하기",
      cancelText: "취소",
      mode: "danger",
      onConfirm: async () => {
        const { error: dbError } = await supabase
          .from("lotto_captures")
          .delete()
          .eq("id", capture.id);

        if (dbError) {
          throw dbError;
        }

        await removeStorageFiles([capture.imagePath]);

        const nextCaptures = capturesRef.current.filter(
          (item) => item.id !== capture.id
        );

        setCaptures(nextCaptures);

        setSelectedCaptureId((prev) => {
          if (prev !== capture.id) return prev;

          return nextCaptures[0]?.id || null;
        });

        if (previewCaptureId === capture.id) {
          setPreviewCaptureId(null);
        }

        setMessage("캡처가 삭제되었습니다.");
        showToast("캡처가 삭제되었습니다.", "success");
      },
    });
  };

  const openClearAllConfirm = () => {
    setConfirmDialog({
      title: "전체 캡처를 모두 삭제할까요?",
      description:
        "저장된 모든 캡처 이미지만 삭제됩니다. 메모장은 삭제되지 않습니다.",
      confirmText: "전체 삭제",
      cancelText: "취소",
      mode: "danger",
      onConfirm: async () => {
        const paths = capturesRef.current.map((capture) => capture.imagePath);

        const { error: dbError } = await supabase
          .from("lotto_captures")
          .delete()
          .neq("id", "00000000-0000-0000-0000-000000000000");

        if (dbError) {
          throw dbError;
        }

        await removeStorageFiles(paths);

        setCaptures([]);
        setSelectedCaptureId(null);
        setPreviewCaptureId(null);
        setMessage("전체 캡처가 삭제되었습니다.");
        showToast("전체 캡처가 삭제되었습니다.", "success");
      },
    });
  };

  const openClearMemoConfirm = () => {
    setConfirmDialog({
      title: "메모장을 비울까요?",
      description:
        "메모장 내용만 삭제됩니다. 캡처 이미지는 삭제되지 않습니다.",
      confirmText: "메모 비우기",
      cancelText: "취소",
      mode: "danger",
      onConfirm: async () => {
        const now = new Date().toISOString();

        const { error } = await supabase.from("lotto_page_notes").upsert(
          {
            id: "main",
            content: "",
            updated_at: now,
          },
          {
            onConflict: "id",
          }
        );

        if (error) {
          throw error;
        }

        setPageMemo("");
        setLastSavedMemo("");
        setMemoUpdatedAt(now);
        setMemoSaveStatus("saved");
        showToast("메모장이 비워졌습니다.", "success");
      },
    });
  };

  const handleConfirmAction = async () => {
    if (!confirmDialog?.onConfirm) return;

    try {
      setIsConfirming(true);
      await confirmDialog.onConfirm();
      setConfirmDialog(null);
    } catch (error) {
      console.error(error);
      setMessage("작업 처리 중 오류가 발생했습니다.");
      showToast("작업 처리 중 오류가 발생했습니다.", "error");
    } finally {
      setIsConfirming(false);
    }
  };

  const handleAutoArrange = async () => {
    if (boardMode !== "editing") {
      showToast("수정 상태에서만 자동 정렬할 수 있습니다.", "info");
      setMessage("저장 상태에서는 자동 정렬이 잠겨 있습니다.");
      return;
    }

    const arranged = captures.map((capture, index) => ({
      ...capture,
      x: 24 + (index % 4) * 310,
      y: 24 + Math.floor(index / 4) * 320,
      zIndex: index + 1,
    }));

    try {
      for (const capture of arranged) {
        const { error } = await supabase
          .from("lotto_captures")
          .update({
            x: capture.x,
            y: capture.y,
            z_index: capture.zIndex,
          })
          .eq("id", capture.id);

        if (error) {
          throw error;
        }
      }

      setCaptures(arranged);
      setMessage("자동 정렬되었습니다.");
      showToast("자동 정렬되었습니다.", "success");
    } catch (error) {
      console.error(error);
      setMessage("자동 정렬 중 오류가 발생했습니다.");
      showToast("자동 정렬 중 오류가 발생했습니다.", "error");
    }
  };

  const filteredCaptures = captures.filter((capture) => {
    const keyword = searchRound.trim();

    if (!keyword) return true;

    return String(capture.round).includes(keyword);
  });

  const totalCount = captures.length;
  const shownCount = filteredCaptures.length;

  return (
    <div className="app">
      <div className="toast-stack">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast-${toast.type}`}>
            <span>{toast.text}</span>
          </div>
        ))}
      </div>

      <button
        type="button"
        className="memo-floating-button"
        onClick={() => setIsMemoOpen(true)}
      >
        <span>메모장</span>
      </button>

      <header className="top-header">
        <div>
          <p className="eyebrow">Lotto Capture Board</p>
          <h1>로또 캡처 저장판</h1>
          <p className="description">
            회차를 입력하고 캡처 이미지를 붙여넣으면 Supabase에 자동 저장됩니다.
          </p>

          <div className="page-links">
            <a href={`${import.meta.env.BASE_URL}lotto-table/index.html`}>
              표로 가기
            </a>
          </div>
        </div>

        <div className="summary-box">
          <span>전체 저장</span>
          <strong>{totalCount}</strong>
        </div>
      </header>

      <section className="control-panel">
        <div className="input-group">
          <label>저장할 회차</label>
          <input
            value={round}
            onChange={(event) => setRound(event.target.value)}
            placeholder="예: 1153"
          />
        </div>

        <div className="input-group">
          <label>회차 검색</label>
          <input
            value={searchRound}
            onChange={(event) => setSearchRound(event.target.value)}
            placeholder="예: 1153"
          />
        </div>

        <button
          type="button"
          className="primary-btn"
          onClick={handleAutoArrange}
          disabled={boardMode !== "editing"}
        >
          자동 정렬
        </button>

        <button type="button" className="danger-btn" onClick={openClearAllConfirm}>
          전체 삭제
        </button>

        <button
          type="button"
          className={`mode-toggle mode-toggle-${boardMode}`}
          onClick={handleToggleBoardMode}
        >
          <span>현재 상태</span>
          <strong>{boardMode === "editing" ? "수정 상태" : "저장 상태"}</strong>
          <em>{boardMode === "editing" ? "드래그 가능" : "이동 잠금"}</em>
        </button>
      </section>

      <section className="paste-guide">
        <div>
          <strong>사용 방법</strong>
          <p>
            로또 화면을 캡처한 뒤 이 페이지에서 <b>Ctrl + V</b>를 누르면 저장됩니다.
            저장 상태에서는 카드 위치가 잠기고, 수정 상태에서만 카드를 움직일 수 있습니다.
          </p>
        </div>

        <div className="status-message">{message}</div>
      </section>

      <section className="workspace">
        <main className="board-wrap">
          <div className="board">
            {isLoading && <div className="empty-box">불러오는 중입니다.</div>}

            {!isLoading && filteredCaptures.length === 0 && (
              <div className="empty-box">
                저장된 캡처가 없습니다. 회차를 입력하고 이미지를 붙여넣으세요.
              </div>
            )}

            {!isLoading &&
              filteredCaptures.map((capture) => (
                <article
                  key={capture.id}
                  className={`capture-card ${
                    selectedCaptureId === capture.id ? "is-selected" : ""
                  } ${boardMode === "editing" ? "is-editing" : "is-locked"}`}
                  style={{
                    transform: `translate(${capture.x}px, ${capture.y}px)`,
                    zIndex: capture.zIndex || 1,
                  }}
                  onClick={() => setSelectedCaptureId(capture.id)}
                >
                  <div
                    className="capture-card-header"
                    onPointerDown={(event) => startDrag(event, capture)}
                  >
                    <div>
                      <strong>{capture.round}회차</strong>
                      <span>{formatDate(capture.createdAt)}</span>
                    </div>

                    <button
                      type="button"
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={(event) => {
                        event.stopPropagation();
                        openDeleteConfirm(capture);
                      }}
                      aria-label="삭제"
                    >
                      삭제
                    </button>
                  </div>

                  <div className="capture-image-box">
                    <img
                      src={capture.imageUrl}
                      alt={`${capture.round}회차 캡처`}
                      onClick={(event) => {
                        event.stopPropagation();
                        setSelectedCaptureId(capture.id);
                        setPreviewCaptureId(capture.id);
                      }}
                    />
                  </div>
                </article>
              ))}
          </div>
        </main>
      </section>

      {isMemoOpen && (
        <div className="memo-modal-overlay" onClick={() => setIsMemoOpen(false)}>
          <section
            className="memo-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="memo-modal-header">
              <div>
                <p className="memo-eyebrow">Page Memo</p>
                <h2>전체 메모장</h2>
              </div>

              <div className="memo-modal-header-right">
                <span className={`memo-status memo-status-${memoSaveStatus}`}>
                  {memoSaveStatus === "saving" && "저장 중"}
                  {memoSaveStatus === "saved" && "저장 완료"}
                  {memoSaveStatus === "error" && "저장 실패"}
                  {memoSaveStatus === "idle" && "대기"}
                </span>

                <button
                  type="button"
                  className="memo-close-btn"
                  onClick={() => setIsMemoOpen(false)}
                >
                  닫기
                </button>
              </div>
            </div>

            <div className="memo-info-box">
              <strong>공용 메모</strong>
              <span>
                {memoUpdatedAt
                  ? `마지막 저장: ${formatDate(memoUpdatedAt)}`
                  : "아직 저장 기록이 없습니다."}
              </span>
            </div>

            <textarea
              value={pageMemo}
              onChange={(event) => setPageMemo(event.target.value)}
              placeholder="여기에 자유롭게 메모하세요. 이 메모장은 특정 사진이 아니라 웹페이지 전체 메모장입니다. 입력 후 잠시 멈추면 Supabase에 자동 저장됩니다."
            />

            <div className="memo-modal-footer">
              <p>
                메모장은 캡처 카드와 별개로 저장됩니다. 캡처를 삭제해도 메모장은 유지됩니다.
              </p>

              <button type="button" onClick={openClearMemoConfirm}>
                메모 비우기
              </button>
            </div>
          </section>
        </div>
      )}

      {previewCapture && (
        <div className="preview-overlay" onClick={() => setPreviewCaptureId(null)}>
          <div
            className="preview-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="preview-header">
              <div>
                <strong>{previewCapture.round}회차</strong>
                <span>{formatDate(previewCapture.createdAt)}</span>
              </div>

              <button type="button" onClick={() => setPreviewCaptureId(null)}>
                닫기
              </button>
            </div>

            <div className="preview-image-box">
              <img
                src={previewCapture.imageUrl}
                alt={`${previewCapture.round}회차 확대 이미지`}
              />
            </div>
          </div>
        </div>
      )}

      {confirmDialog && (
        <div className="dialog-overlay" onClick={() => setConfirmDialog(null)}>
          <div
            className="dialog-box"
            onClick={(event) => event.stopPropagation()}
          >
            <div className={`dialog-icon dialog-icon-${confirmDialog.mode}`}>
              !
            </div>

            <h3>{confirmDialog.title}</h3>
            <p>{confirmDialog.description}</p>

            <div className="dialog-actions">
              <button
                type="button"
                className="dialog-cancel-btn"
                onClick={() => setConfirmDialog(null)}
                disabled={isConfirming}
              >
                {confirmDialog.cancelText || "취소"}
              </button>

              <button
                type="button"
                className={`dialog-confirm-btn dialog-confirm-${confirmDialog.mode}`}
                onClick={handleConfirmAction}
                disabled={isConfirming}
              >
                {isConfirming ? "처리 중" : confirmDialog.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}

      <footer className="bottom-info">
        현재 화면 표시: {shownCount}개 / 전체 저장: {totalCount}개
      </footer>
    </div>
  );
}