using UnityEngine;
using UnityEngine.SceneManagement;

/// <summary>
/// 掛在一個空的 GameManager GameObject 上，全場景只需要一個。
/// 被怪物抓到時鎖定畫面並提供重來（按 R 重新載入場景）。
/// </summary>
public class HorrorGameManager : MonoBehaviour
{
    public static HorrorGameManager Instance { get; private set; }

    [SerializeField] private KeyCode restartKey = KeyCode.R;

    private bool isGameOver;

    private void Awake()
    {
        if (Instance != null && Instance != this)
        {
            Destroy(gameObject);
            return;
        }

        Instance = this;
    }

    private void Update()
    {
        if (isGameOver && Input.GetKeyDown(restartKey))
        {
            SceneManager.LoadScene(SceneManager.GetActiveScene().buildIndex);
        }
    }

    public void TriggerGameOver()
    {
        if (isGameOver)
        {
            return;
        }

        isGameOver = true;
        Cursor.lockState = CursorLockMode.None;
        Debug.Log("你被抓到了。按 R 重新開始。");
    }
}
